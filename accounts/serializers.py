from decimal import Decimal
from urllib.parse import urlparse, parse_qs

from rest_framework import serializers

from .models import Battle, BattleBet, CustomUser


class BattleBetSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        source='user.username',
        read_only=True
    )

    avatar_url = serializers.CharField(
        source='user.avatar_url',
        read_only=True
    )

    chance = serializers.SerializerMethodField()

    class Meta:
        model = BattleBet
        fields = [
            'id',
            'username',
            'avatar_url',
            'amount',
            'created_at',
            'chance',
        ]

    def get_chance(self, obj):
        total_bank = obj.battle.total_bank

        if total_bank <= 0:
            return 0

        chance = (
            obj.amount / total_bank
        ) * 100

        return round(chance, 2)


class BattleSerializer(serializers.ModelSerializer):
    bets = BattleBetSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Battle
        fields = [
            'id',
            'status',
            'max_players',
            'total_bank',
            'winner',
            'commission',
            'created_at',
            'started_at',
            'finished_at',
            'bets',
        ]


class JoinBattleSerializer(serializers.Serializer):
    inventory_item_id = serializers.IntegerField(min_value=1)


class DepositSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01')
    )


class ProfileSerializer(serializers.ModelSerializer):
    trade_url = serializers.CharField(
        required=False,
        allow_blank=True
    )

    class Meta:
        model = CustomUser
        fields = [
            'id',
            'username',
            'avatar_url',
            'steam_id',
            'trade_url',
            'phone',
            'bio',
            'city',
            'birth_date',
        ]
        read_only_fields = [
            'id',
            'username',
            'avatar_url',
            'steam_id',
        ]

    def validate_trade_url(self, value):
        value = value.strip()

        if not value:
            return value

        parsed = urlparse(value)

        if parsed.scheme != 'https':
            raise serializers.ValidationError(
                'Trade URL должен начинаться с https://'
            )

        if parsed.netloc != 'steamcommunity.com':
            raise serializers.ValidationError(
                'Это не Steam Trade URL'
            )

        if parsed.path != '/tradeoffer/new/':
            raise serializers.ValidationError(
                'Неверный формат Steam Trade URL'
            )

        params = parse_qs(parsed.query)

        partner = params.get('partner', [None])[0]
        token = params.get('token', [None])[0]

        if not partner or not partner.isdigit():
            raise serializers.ValidationError(
                'В Trade URL отсутствует корректный partner'
            )

        if not token:
            raise serializers.ValidationError(
                'В Trade URL отсутствует token'
            )

        return value

    def update(self, instance, validated_data):
        trade_url = validated_data.pop(
            'trade_url',
            None
        )

        if trade_url is not None:
            trade_url = trade_url.strip()

            if trade_url:
                parsed = urlparse(trade_url)
                params = parse_qs(parsed.query)

                partner = params['partner'][0]
                token = params['token'][0]

                # Преобразуем Steam partner ID
                # в SteamID64
                steam_id64 = (
                    int(partner)
                    + 76561197960265728
                )

                instance.steam_id = str(
                    steam_id64
                )

                instance.trade_token = token

            else:
                # Пользователь удалил Trade URL
                instance.steam_id = ''
                instance.trade_token = ''

        for attr, value in validated_data.items():
            setattr(
                instance,
                attr,
                value
            )

        instance.save()

        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if instance.steam_id and instance.trade_token:
            try:
                steam_id64 = int(
                    instance.steam_id
                )

                partner = (
                    steam_id64
                    - 76561197960265728
                )

                data['trade_url'] = (
                    'https://steamcommunity.com/'
                    'tradeoffer/new/'
                    f'?partner={partner}'
                    f'&token={instance.trade_token}'
                )

            except (ValueError, TypeError):
                data['trade_url'] = ''

        else:
            data['trade_url'] = ''

        return data