from urllib.parse import urlencode
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

from .models import Wallet
import os


STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"


def build_steam_login_url(callback_url):
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callback_url,
        "openid.realm": "http://127.0.0.1:8000",
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }

    return f"{STEAM_OPENID_URL}?{urlencode(params)}"

import re


def extract_steam_id(claimed_id):
    match = re.search(
        r'/openid/id/(\d+)$',
        claimed_id
    )

    if not match:
        raise ValueError(
            'Не удалось получить SteamID'
        )

    return match.group(1)

import requests


def verify_steam_response(params):
    data = params.copy()
    data["openid.mode"] = "check_authentication"

    response = requests.post(
        STEAM_OPENID_URL,
        data=data,
        timeout=10,
    )

    print("===== STEAM VERIFY =====")
    print(response.status_code)
    print(response.text)
    print("========================")

    response.raise_for_status()

    return "is_valid:true" in response.text

def get_or_create_steam_user(steam_id):
    User = get_user_model()

    user, created = User.objects.get_or_create(
        steam_id=steam_id,
        defaults={
            'username': f'steam_{steam_id}',
        },
    )

    if created:
        user.set_unusable_password()
        user.save(
            update_fields=['password']
        )

    Wallet.objects.get_or_create(
        user=user
    )

    return user, created

def get_user_token(user):
    token, created = Token.objects.get_or_create(
        user=user
    )

    return token.key

def get_steam_profile(steam_id):
    api_key = os.getenv("STEAM_API_KEY")

    if not api_key:
        raise RuntimeError("Steam API key не найден")

    response = requests.get(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
        params={
            "key": api_key,
            "steamids": steam_id,
        },
        timeout=10,
    )

    response.raise_for_status()

    data = response.json()

    players = data.get("response", {}).get("players", [])

    if not players:
        raise RuntimeError("Steam-профиль не найден")

    return players[0]