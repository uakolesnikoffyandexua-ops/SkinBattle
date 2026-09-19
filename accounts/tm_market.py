import os
import requests
import time
from decimal import Decimal
from .models import TMMarketOffer


TM_MARKET_API_URL = "https://market.csgo.com/api/v2"
SHOP_NAME_CACHE = {
    "items": [],
    "expires_at": 0,
}

SHOP_NAME_CACHE_TTL = 300
MAX_SHOP_NAMES = 50
MAX_SHOP_RESULTS = 100


def get_api_key():
    return os.getenv("TM_MARKET_API_KEY")

def get_shop_name_catalog():
    now = time.time()

    if (
        SHOP_NAME_CACHE["items"]
        and SHOP_NAME_CACHE["expires_at"] > now
    ):
        return SHOP_NAME_CACHE["items"]

    response = requests.get(
        "https://market.csgo.com/api/v2/prices/RUB.json",
        timeout=20,
    )

    response.raise_for_status()

    result = response.json()

    if not result.get("success"):
        raise RuntimeError(
            "TM Market не вернул список цен"
        )

    items = result.get("items", [])

    catalog = []

    for item in items:
        market_hash_name = item.get(
            "market_hash_name"
        )

        price = item.get("price")

        if not market_hash_name or price is None:
            continue

        catalog.append({
            "market_hash_name": market_hash_name,
            "tm_price": Decimal(str(price)),
        })

    SHOP_NAME_CACHE["items"] = catalog
    SHOP_NAME_CACHE["expires_at"] = (
        now + SHOP_NAME_CACHE_TTL
    )

    return catalog
def search_shop_offers(
    query,
    min_price=None,
    max_price=None,
    page=1,
):
    api_key = get_api_key()

    if not api_key:
        raise RuntimeError(
            "TM Market API key не найден"
        )

    query = query.strip().lower()

    catalog = get_shop_name_catalog()

    min_value = (
        Decimal(str(min_price))
        if min_price
        else Decimal("0")
    )

    max_value = (
        Decimal(str(max_price))
        if max_price
        else Decimal("999999999")
    )

    matching_items = []

    for item in catalog:
        name = item["market_hash_name"]
        tm_price = item["tm_price"]

        skinbattle_price = (
            tm_price * Decimal("1.02")
        )

        if query and query not in name.lower():
            continue

        if (
            skinbattle_price < min_value
            or skinbattle_price > max_value
        ):
            continue

        matching_items.append(item)

    matching_items.sort(
        key=lambda item: item["tm_price"]
    )

    matching_names = [
        item["market_hash_name"]
        for item in matching_items
    ]

    total_matching_names = len(matching_names)

    page = max(int(page), 1)

    start_index = (
        page - 1
    ) * MAX_SHOP_NAMES

    end_index = (
        start_index + MAX_SHOP_NAMES
    )

    matching_names = matching_names[
        start_index:end_index
    ]

    params = [
        ("key", api_key),
    ]

    for name in matching_names:
        params.append(
            ("list_hash_name[]", name)
        )

    response = requests.get(
        f"{TM_MARKET_API_URL}/"
        "search-list-items-by-hash-name-all",
        params=params,
        timeout=20,
    )

    response.raise_for_status()

    result = response.json()

    if not result.get("success"):
        raise RuntimeError(
            "TM Market не вернул предложения"
        )

    offers_by_name = result.get(
        "data",
        {}
    )

    offers = []

    for market_hash_name, item_offers in (
        offers_by_name.items()
    ):
        for offer in item_offers:

            tm_price = (
                Decimal(
                    str(offer.get("price", 0))
                )
                / Decimal("100")
            )

            skinbattle_price = (
                tm_price * Decimal("1.02")
            ).quantize(
                Decimal("0.01")
            )

            if (
                skinbattle_price < min_value
                or skinbattle_price > max_value
            ):
                continue

            item_class = offer.get("class")

            icon_url = (
                "https://steamcommunity-a.akamaihd.net/"
                f"economy/image/class/730/"
                f"{item_class}/200fx200f"
                if item_class
                else ""
            )

            extra = offer.get("extra") or {}

            offer_id = str(
                offer.get("id")
            )

            item_instance = (
                str(offer.get("instance"))
                if offer.get("instance")
                else ""
            )

            source = offer.get("source") or ""

            float_value = extra.get("float")
            phase = extra.get("phase") or ""

            # ==========================================
            # СОХРАНЯЕМ OFFER В БАЗУ
            # ==========================================

            db_offer = TMMarketOffer.objects.filter(
                offer_id=offer_id
            ).first()

            if db_offer:

                db_offer.market_hash_name = (
                    market_hash_name
                )

                db_offer.tm_price = tm_price

                db_offer.item_class = (
                    str(item_class)
                    if item_class
                    else ""
                )

                db_offer.item_instance = (
                    item_instance
                )

                db_offer.source = source

                db_offer.float_value = (
                    Decimal(str(float_value))
                    if float_value is not None
                    else None
                )

                db_offer.phase = phase

                if not db_offer.reserved:
                    db_offer.available = True

                db_offer.save()

            else:

                TMMarketOffer.objects.create(
                    offer_id=offer_id,
                    market_hash_name=market_hash_name,
                    tm_price=tm_price,
                    item_class=(
                        str(item_class)
                        if item_class
                        else ""
                    ),
                    item_instance=item_instance,
                    source=source,
                    float_value=(
                        Decimal(str(float_value))
                        if float_value is not None
                        else None
                    ),
                    phase=phase,
                    available=True,
                    reserved=False,
                )

            # ==========================================
            # ОТДАЁМ OFFER ФРОНТЕНДУ
            # ==========================================

            offers.append({
                "offer_id": offer_id,

                "market_hash_name":
                    market_hash_name,

                "tm_price":
                    f"{tm_price:.2f}",

                "skinbattle_price":
                    f"{skinbattle_price:.2f}",

                "item_class":
                    str(item_class)
                    if item_class
                    else None,

                "item_instance":
                    item_instance
                    if item_instance
                    else None,

                "source":
                    source,

                "float_value":
                    float_value,

                "phase":
                    phase,

                "icon_url":
                    icon_url,
            })

    offers.sort(
        key=lambda item: Decimal(
            item["skinbattle_price"]
        )
    )

    return {
        "results": offers[:MAX_SHOP_RESULTS],
        "page": page,
        "has_more": end_index < total_matching_names,
    }

def get_featured_shop_offers(limit=12):
    featured_offers = []

    for market_hash_name in SHOP_SKINS[:limit]:
        try:
            offer = get_cheapest_offer(
                market_hash_name
            )

            if offer is None:
                continue

            item_class = offer.get("class")
            extra = offer.get("extra") or {}

            tm_price = Decimal(
                str(offer["tm_price"])
            )

            skinbattle_price = (
                tm_price * Decimal("1.02")
            ).quantize(
                Decimal("0.01")
            )

            featured_offers.append({
                "offer_id": str(
                    offer["offer_id"]
                ),
                "market_hash_name": (
                    offer["market_hash_name"]
                ),
                "tm_price": (
                    f"{tm_price:.2f}"
                ),
                "skinbattle_price": (
                    f"{skinbattle_price:.2f}"
                ),
                "item_class": (
                    str(item_class)
                    if item_class
                    else None
                ),
                "item_instance": (
                    str(
                        offer.get("instance")
                    )
                    if offer.get("instance")
                    else None
                ),
                "source": (
                    offer.get("source")
                    or ""
                ),
                "float_value": extra.get(
                    "float"
                ),
                "phase": extra.get(
                    "phase"
                ) or "",
                "icon_url": (
                    "https://steamcommunity-a.akamaihd.net/"
                    "economy/image/class/730/"
                    f"{item_class}/200fx200f"
                    if item_class
                    else ""
                ),
            })

        except Exception as error:
            print(
                "FEATURED SKIN ERROR:",
                market_hash_name,
                error,
            )

    return featured_offers[:limit]


def search_item_by_hash_name_specific(market_hash_name):
    api_key = get_api_key()

    if not api_key:
        raise RuntimeError("TM Market API key не найден")

    response = requests.get(
        f"{TM_MARKET_API_URL}/search-item-by-hash-name-specific",
        params={
            "key": api_key,
            "hash_name": market_hash_name,
        },
        timeout=10,
    )

    response.raise_for_status()

    return response.json()

def check_specific_offer(offer_id, market_hash_name, expected_tm_price):
    api_key = get_api_key()

    if not api_key:
        raise RuntimeError("TM Market API key не найден")

    response = requests.get(
        f"{TM_MARKET_API_URL}/search-item-by-hash-name-specific",
        params={
            "key": api_key,
            "hash_name": market_hash_name,
        },
        timeout=10,
    )

    response.raise_for_status()

    result = response.json()

    if not result.get("success"):
        raise RuntimeError(
            "TM Market не вернул успешный ответ"
        )

    offers = result.get("data", [])

    expected_price = int(
        Decimal(str(expected_tm_price)) * 100
    )

    for offer in offers:
        if (
            str(offer.get("id")) == str(offer_id)
            and int(offer.get("price", 0)) == expected_price
        ):
            return offer

    return None

def get_cheapest_offer(market_hash_name):
    result = search_item_by_hash_name_specific(market_hash_name)

    if not result.get("success"):
        raise RuntimeError("TM Market не вернул успешный ответ")

    offers = result.get("data", [])

    if not offers:
        return None

    cheapest = min(offers, key=lambda item: item["price"])

    tm_price = cheapest["price"] / 100
    skinbattle_price = round(tm_price * 1.02, 2)

    return {
        "offer_id": cheapest["id"],
        "market_hash_name": cheapest["market_hash_name"],
        "tm_price": tm_price,
        "skinbattle_price": skinbattle_price,
        "class": cheapest.get("class"),
        "instance": cheapest.get("instance"),
        "source": cheapest.get("source"),
        "extra": cheapest.get("extra"),
    }
SHOP_SKINS = [
    "AWP | Dragon Lore (Factory New)",
    "AWP | Dragon Lore (Field-Tested)",
    "AWP | Gungnir (Factory New)",
    "M4A4 | Howl (Factory New)",
    "AK-47 | Case Hardened (Factory New)",
    "AWP | Medusa (Factory New)",
    "AK-47 | X-Ray (Factory New)",
    "AWP | Desert Hydra (Factory New)",
    "AK-47 | Fire Serpent (Factory New)",
    "Karambit | Doppler (Factory New)",
    "Butterfly Knife | Doppler (Factory New)",
    "M9 Bayonet | Doppler (Factory New)",
]


def get_shop_offers():
    result = []

    for market_hash_name in SHOP_SKINS:
        try:
            offer = get_cheapest_offer(market_hash_name)

            if offer is not None:
                result.append(offer)

        except Exception as error:
            result.append({
                "market_hash_name": market_hash_name,
                "error": str(error),
            })

    return result
def buy_for(
    offer_id,
    price,
    partner,
    token,
    custom_id=None,
):
    api_key = get_api_key()

    if not api_key:
        raise RuntimeError(
            "TM Market API key не найден"
        )

    data = {
        "key": api_key,
        "id": offer_id,
        "price": int(
            Decimal(str(price)) * 100
        ),
        "partner": partner,
        "token": token,
    }

    if custom_id is not None:
        data["custom_id"] = custom_id

    response = requests.post(
        f"{TM_MARKET_API_URL}/buy-for",
        data=data,
        timeout=10,
    )

    response.raise_for_status()

    return response.json()