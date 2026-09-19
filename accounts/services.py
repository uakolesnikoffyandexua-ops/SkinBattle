import secrets
import hashlib
from decimal import Decimal

from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from .models import (
    Wallet,
    Battle,
    BattleBet,
    WalletTransaction,
    InventoryItem,
    ShopListing,
    PlatformWallet,
    TMMarketOffer,
    ShopReservation,
    AuditLog,
)


def create_battle(max_players=10, user=None):
    if max_players < 2:
        raise ValueError(
            "В Battle должно быть минимум 2 игрока"
        )

    if max_players > 10:
        raise ValueError(
            "В Battle может быть максимум 10 игроков"
        )

    if user is not None:
        active_battles_count = Battle.objects.filter(
            created_by=user,
            status__in=['waiting', 'active'],
        ).count()

        if active_battles_count >= 2:
            raise ValueError(
                "Вы не можете создать больше 2 активных Battle одновременно"
            )

    if user is not None:
       active_battles_count = Battle.objects.filter(
        created_by=user,
        status__in=['waiting', 'active'],
    ).count()

    if active_battles_count >= 2:
        raise ValueError(
            'Вы не можете создать больше 2 активных Battle одновременно'
        )

    server_seed = secrets.token_hex(32)

    server_seed_hash = hashlib.sha256(
        server_seed.encode()
    ).hexdigest()

    battle = Battle.objects.create(
      max_players=max_players,
      server_seed=server_seed,
      server_seed_hash=server_seed_hash,
      created_by=user,
    )

    log_action(
        user=user,
        action='battle_created',
        description=f'Battle #{battle.id} created',
        metadata={
            'battle_id': battle.id,
            'max_players': battle.max_players,
            'user_id': user.id if user else None,
            'username': user.username if user else None,
        },
    )

    return battle


def join_battle(battle_id, user, inventory_item):
    with transaction.atomic():

        battle = (
            Battle.objects
            .select_for_update()
            .get(id=battle_id)
        )

        if battle.status != 'waiting':
            raise ValueError(
                "Battle ещё не запущена или уже завершена"
            )

        if BattleBet.objects.filter(
            battle=battle,
            user=user
        ).exists():
            raise ValueError(
                "Вы уже участвуете в этой Battle"
            )

        if battle.bets.count() >= battle.max_players:
            raise ValueError(
                "Battle заполнена"
            )

        # Блокируем сам InventoryItem
        inventory_item = (
            InventoryItem.objects
            .select_for_update()
            .get(
                id=inventory_item.id,
                user=user
            )
        )

        if inventory_item.status != "available":
           raise ValueError(
        "Этот предмет нельзя использовать"
        )

        if inventory_item.skinbattle_price <= 0:
          raise ValueError(
        "Стоимость скина должна быть больше 0"
        )

        amount = inventory_item.skinbattle_price

        inventory_item.status = "in_battle"

        inventory_item.save(
        update_fields=["status"]
        )

        log_action(
            user=user,
            action='item_locked',
            description=(
                f'Item #{inventory_item.id} locked for Battle #{battle.id}'
            ),
            metadata={
                'battle_id': battle.id,
                'inventory_item_id': inventory_item.id,
                'amount': str(amount),
                'username': user.username,
            },
        )

        return place_bet(
            battle_id=battle_id,
            user=user,
            amount=amount,
            inventory_item=inventory_item
        )


def start_battle(battle_id):
    with transaction.atomic():

        battle = (
            Battle.objects
            .select_for_update()
            .get(id=battle_id)
        )

        if battle.status != 'waiting':
            raise ValueError(
                "Battle уже запущена или завершена"
            )

        players_count = (
            battle.bets
            .values('user')
            .distinct()
            .count()
        )

        if players_count < 2:
            raise ValueError(
                "Для запуска Battle нужно минимум 2 игрока"
            )

        battle.status = 'active'
        battle.started_at = timezone.now()

        battle.save(
            update_fields=[
                'status',
                'started_at',
            ]
        )

        log_action(
            user=None,
            action='battle_started',
            description=f'Battle #{battle.id} started',
            metadata={
                'battle_id': battle.id,
                'players_count': players_count,
                'total_bank': str(battle.total_bank),
                'started_at': battle.started_at.isoformat(),
            },
        )


def is_battle_ready(battle_id):
    battle = Battle.objects.get(id=battle_id)

    if battle.status != 'active':
        return False

    if battle.started_at is None:
        return False

    elapsed = timezone.now() - battle.started_at

    return elapsed.total_seconds() >= 5


def process_battle(battle_id):
    battle = Battle.objects.get(id=battle_id)

    if battle.status == 'finished':
        return {
            'status': 'finished',
            'winner': (
                battle.winner.username
                if battle.winner
                else None
            ),
        }

    if battle.status != 'active':
        return {
            'status': 'waiting'
        }

    if not is_battle_ready(battle_id):
        return {
            'status': 'waiting'
        }

    return finish_battle(battle_id)


def place_bet(
    battle_id,
    user,
    amount,
    inventory_item
):
    with transaction.atomic():

        if amount <= 0:
            raise ValueError(
                "Стоимость скина должна быть больше 0"
            )

        try:
            battle = (
                Battle.objects
                .select_for_update()
                .get(
                    id=battle_id,
                    status='waiting'
                )
            )
        except Battle.DoesNotExist:
            raise ValueError(
                "Battle не найдена или уже запущена"
            )

        if inventory_item.user_id != user.id:
            raise ValueError(
                "Этот предмет не принадлежит вам"
            )

        if inventory_item.status != "in_battle":
          raise ValueError(
        "Предмет не заблокирован для Battle"
        )

        bet = BattleBet.objects.create(
            battle=battle,
            user=user,
            inventory_item=inventory_item,
            amount=amount
        )

        battle.total_bank += amount

        battle.save(
            update_fields=['total_bank']
        )

        log_action(
            user=user,
            action='bet_placed',
            description=(
                f'Bet placed in Battle #{battle.id} '
                f'with item #{inventory_item.id} '
                f'for {amount}'
            ),
            metadata={
                'battle_id': battle.id,
                'user_id': user.id,
                'username': user.username,
                'inventory_item_id': inventory_item.id,
                'amount': str(amount),
                'battle_bank': str(battle.total_bank),
            },
        )

        return {
            'bet': bet,
            'new_balance': None,
            'battle_bank': battle.total_bank,
        }


def deposit(user, amount):
    with transaction.atomic():

        if amount <= 0:
            raise ValueError(
                "Сумма пополнения должна быть больше 0"
            )

        try:
            wallet = (
                Wallet.objects
                .select_for_update()
                .get(user=user)
            )
        except Wallet.DoesNotExist:
            raise ValueError(
                "Кошелёк пользователя не найден"
            )

        wallet.balance += amount

        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        WalletTransaction.objects.create(
            user=user,
            amount=amount,
            type='deposit'
        )

        log_action(
            user=user,
            action='deposit',
            description=f'Deposit: +{amount} SB',
            metadata={
                'amount': str(amount),
                'new_balance': str(wallet.balance),
                'username': user.username,
            },
        )

        return {
            'new_balance': wallet.balance,
        }


def generate_provably_fair_result(
    server_seed,
    battle_id,
    nonce,
    total_cents
):
    if total_cents <= 0:
        raise ValueError(
            "Сумма банка должна быть больше 0"
        )

    message = (
        f"{server_seed}:{battle_id}:{nonce}"
    )

    hash_result = hashlib.sha256(
        message.encode()
    ).hexdigest()

    random_number = int(
        hash_result[:16],
        16
    )

    random_value = (
        random_number % total_cents
    )

    return {
        'hash': hash_result,
        'random_value': random_value,
    }


def verify_battle_result(battle):
    if battle.status != 'finished':
        raise ValueError(
            "Battle ещё не завершена"
        )

    bets = (
        BattleBet.objects
        .filter(battle=battle)
        .select_related('user')
    )

    if not bets.exists():
        raise ValueError(
            "В Battle нет ставок"
        )

    total_bank = sum(
        bet.amount for bet in bets
    )

    total_cents = int(
        total_bank * 100
    )

    result = generate_provably_fair_result(
        battle.server_seed,
        battle.id,
        battle.nonce,
        total_cents
    )

    random_value = result['random_value']

    current = 0
    calculated_winner = None

    for bet in bets:
        bet_cents = int(
            bet.amount * 100
        )

        current += bet_cents

        if random_value < current:
            calculated_winner = bet.user
            break

    if calculated_winner is None:
        raise ValueError(
            "Не удалось определить победителя"
        )

    hash_valid = (
        hashlib.sha256(
            battle.server_seed.encode()
        ).hexdigest()
        == battle.server_seed_hash
    )

    winner_valid = (
        calculated_winner.id
        == battle.winner_id
    )

    return {
        'hash_valid': hash_valid,
        'winner_valid': winner_valid,
        'calculated_winner': (
            calculated_winner.username
        ),
        'actual_winner': (
            battle.winner.username
            if battle.winner
            else None
        ),
        'random_value': random_value,
        'hash': result['hash'],
        'server_seed_hash': (
            battle.server_seed_hash
        ),
    }


def choose_winner(battle, bets):
    total_bank = sum(
        bet.amount for bet in bets
    )

    if total_bank <= 0:
        raise ValueError(
            "Банк Battle должен быть больше 0"
        )

    total_cents = int(
        total_bank * 100
    )

    result = generate_provably_fair_result(
        battle.server_seed,
        battle.id,
        battle.nonce,
        total_cents
    )

    random_value = result['random_value']

    current = 0

    for bet in bets:
        bet_cents = int(
            bet.amount * 100
        )

        current += bet_cents

        if random_value < current:
            return {
                'winner': bet.user,
                'random_value': random_value,
                'hash': result['hash'],
                'total_bank': total_bank,
            }

    raise ValueError(
        "Не удалось определить победителя"
    )


def finish_battle(battle_id):
    with transaction.atomic():

        battle = (
            Battle.objects
            .select_for_update()
            .get(id=battle_id)
        )

        if battle.status != 'active':
            raise ValueError(
                "Battle ещё не запущена или уже завершена"
            )

        bets = (
            BattleBet.objects
            .filter(battle=battle)
            .select_related(
                'user',
                'inventory_item'
            )
        )

        if not bets.exists():
            raise ValueError(
                "В Battle нет ставок"
            )

        total_bank = sum(
            bet.amount for bet in bets
        )

        if total_bank <= 0:
            raise ValueError(
                "Банк Battle должен быть больше 0"
            )

        winner_result = choose_winner(
            battle,
            bets
        )

        winner = winner_result['winner']
        random_value = (
            winner_result['random_value']
        )
        total_bank = (
            winner_result['total_bank']
        )

        battle_items = [
            bet.inventory_item
            for bet in bets
            if bet.inventory_item is not None
        ]

        # Передаём все скины победителю
        for item in battle_items:
            item.user = winner
            item.status = "available"

            item.save(
            update_fields=[
                "user",
                "status",
                "updated_at",
            ]
        )

            log_action(
                user=winner,
                action='item_received',
                description=(
                    f'Item #{item.id} received by winner '
                    f'of Battle #{battle.id}'
                ),
                metadata={
                    'battle_id': battle.id,
                    'inventory_item_id': item.id,
                    'winner_id': winner.id,
                    'winner_username': winner.username,
                },
            )

        # В Battle комиссии нет
        battle.commission = Decimal('0.00')
        battle.winner = winner
        battle.status = 'finished'
        battle.finished_at = timezone.now()

        battle.save(
            update_fields=[
                'winner',
                'commission',
                'status',
                'finished_at',
            ]
        )

        log_action(
            user=winner,
            action='battle_finished',
            description=(
                f'Battle #{battle.id} finished. Winner: {winner.username}'
            ),
            metadata={
                'battle_id': battle.id,
                'winner_id': winner.id,
                'winner_username': winner.username,
                'total_bank': str(total_bank),
                'commission': str(Decimal('0.00')),
                'prize': str(total_bank),
                'random_value': random_value,
                'hash': winner_result['hash'],
                'finished_at': battle.finished_at.isoformat(),
            },
        )

        log_action(
            user=winner,
            action='win',
            description=(
                f'Won Battle #{battle.id} with prize {total_bank}'
            ),
            metadata={
                'battle_id': battle.id,
                'winner_id': winner.id,
                'winner_username': winner.username,
                'prize': str(total_bank),
                'total_bank': str(total_bank),
                'random_value': random_value,
                'hash': winner_result['hash'],
            },
        )

        return {
            'winner': winner.username,
            'total_bank': total_bank,
            'commission': Decimal('0.00'),
            'prize': total_bank,
            'random_value': random_value,
            'hash': winner_result['hash'],
        }


def get_user_battle_history(user):
    bets = (
        BattleBet.objects
        .filter(user=user)
        .select_related('battle')
        .order_by('-created_at')
    )

    history = []

    for bet in bets:
        battle = bet.battle

        if battle.status != 'finished':
            continue

        is_winner = (
            battle.winner_id == user.id
        )

        if is_winner:
            prize = battle.total_bank
        else:
            prize = Decimal('0.00')

        history.append({
            'battle_id': battle.id,
            'status': battle.status,
            'bet': bet.amount,
            'bank': battle.total_bank,
            'commission': Decimal('0.00'),
            'prize': prize,
            'is_winner': is_winner,
            'created_at': battle.created_at,
            'finished_at': battle.finished_at,
        })

    return history


def get_user_battle_stats(user):
    bets = (
        BattleBet.objects
        .filter(
            user=user,
            battle__status='finished'
        )
        .select_related('battle')
    )

    total_battles = bets.count()

    wins = bets.filter(
        battle__winner=user
    ).count()

    losses = total_battles - wins

    total_bet = sum(
        (bet.amount for bet in bets),
        Decimal('0.00')
    )

    total_prize = Decimal('0.00')

    for bet in bets:
        if bet.battle.winner_id == user.id:
            total_prize += bet.battle.total_bank

    return {
        'battles': total_battles,
        'wins': wins,
        'losses': losses,
        'total_bet': total_bet,
        'total_prize': total_prize,
    }


def get_wallet_transactions(user):
    transactions = (
        WalletTransaction.objects
        .filter(user=user)
        .select_related('battle')
        .order_by('-created_at')
    )

    result = []

    for transaction in transactions:
        result.append({
            'id': transaction.id,
            'type': transaction.type,
            'amount': transaction.amount,
            'battle_id': (
                transaction.battle.id
                if transaction.battle
                else None
            ),
            'created_at': transaction.created_at,
        })

    return result


def leave_battle(battle_id, user):
    with transaction.atomic():

        battle = (
            Battle.objects
            .select_for_update()
            .get(id=battle_id)
        )

        if battle.status != 'waiting':
            raise ValueError(
                'Нельзя выйти из Battle после её начала'
            )

        bet = (
            BattleBet.objects
            .select_for_update()
            .filter(
                battle=battle,
                user=user
            )
            .first()
        )

        if not bet:
            raise ValueError(
                'Вы не участвуете в этой Battle'
            )

        # Разблокируем скин
        if bet.inventory_item_id:
            inventory_item = (
                InventoryItem.objects
                .select_for_update()
                .get(
                    id=bet.inventory_item_id
                )
            )

            inventory_item.status = "available"

            inventory_item.save(
                update_fields=["status"]
            )

        refund_amount = bet.amount

        # Уменьшаем только оценочный банк Battle
        battle.total_bank -= refund_amount

        if battle.total_bank < 0:
            battle.total_bank = Decimal('0.00')

        battle.save(
            update_fields=['total_bank']
        )

        # Удаляем ставку
        bet.delete()

        log_action(
            user=user,
            action='battle_left',
            description=(
                f'Left Battle #{battle.id} with refund {refund_amount}'
            ),
            metadata={
                'battle_id': battle.id,
                'inventory_item_id': bet.inventory_item_id,
                'refund_amount': str(refund_amount),
                'battle_bank': str(battle.total_bank),
                'username': user.username,
            },
        )

        return {
            'battle_id': battle.id,
            'username': user.username,
            'refund_amount': refund_amount,
            'new_balance': None,
            'battle_bank': battle.total_bank,
        }
def create_shop_listing(user, inventory_item_id, price):
    with transaction.atomic():
        inventory_item = (
            InventoryItem.objects
            .select_for_update()
            .get(
                id=inventory_item_id,
                user=user
            )
        )

        if not inventory_item.tradable:
            raise ValueError(
                "Этот предмет нельзя выставить на продажу"
            )

        if price <= 0:
            raise ValueError(
                "Цена должна быть больше 0"
            )

        if ShopListing.objects.filter(
            item=inventory_item,
            status='active'
        ).exists():
            raise ValueError(
                "Этот предмет уже выставлен на продажу"
            )

        listing = ShopListing.objects.create(
            item=inventory_item,
            seller=user,
            price=price
        )

        log_action(
            user=user,
            action='item_sold',
            description=(
                f'Item #{inventory_item.id} listed for sale for {price} SB'
            ),
            metadata={
                'listing_id': listing.id,
                'inventory_item_id': inventory_item.id,
                'price': str(price),
                'username': user.username,
            },
        )

        return listing
def cancel_shop_listing(user, listing_id):
    with transaction.atomic():
        listing = (
            ShopListing.objects
            .select_for_update()
            .select_related('item')
            .get(
                id=listing_id,
                seller=user
            )
        )

        if listing.status != 'active':
            raise ValueError(
                "Это объявление уже не активно"
            )

        item = (
            InventoryItem.objects
            .select_for_update()
            .get(id=listing.item_id)
        )

        item.status = "available"

        item.save(
          update_fields=["status"]
        )

        listing.status = 'cancelled'
        listing.save(
            update_fields=[
                'status',
                'updated_at',
            ]
        )

        log_action(
            user=user,
            action='item_unlocked',
            description=(
                f'Cancelled shop listing #{listing.id} for item #{item.id}'
            ),
            metadata={
                'listing_id': listing.id,
                'inventory_item_id': item.id,
                'price': str(listing.price),
                'username': user.username,
            },
        )

        return listing

    
def add_platform_balance(amount):
    with transaction.atomic():
        wallet = (
            PlatformWallet.objects
            .select_for_update()
            .first()
        )

        if wallet is None:
            wallet = PlatformWallet.objects.create()

        if amount <= 0:
            raise ValueError(
                "Сумма должна быть больше 0"
            )

        wallet.balance += amount
        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        return wallet
def buy_shop_listing(user, listing_id):
    with transaction.atomic():
        listing = (
            ShopListing.objects
            .select_for_update()
            .select_related('item', 'seller')
            .get(id=listing_id)
        )

        if listing.status != 'active':
            raise ValueError(
                "Это объявление уже не активно"
            )

        if listing.seller_id == user.id:
            raise ValueError(
                "Нельзя купить собственный предмет"
            )

        item = (
            InventoryItem.objects
            .select_for_update()
            .get(id=listing.item_id)
        )

        if item.user_id != listing.seller_id:
            raise ValueError(
                "Владелец предмета не совпадает с продавцом"
            )

        buyer_wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=user)
        )

        seller_wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=listing.seller)
        )

        platform_wallet = (
            PlatformWallet.objects
            .select_for_update()
            .first()
        )

        if platform_wallet is None:
            platform_wallet = PlatformWallet.objects.create()

        price = listing.price
        commission = price * Decimal('0.02')
        total_price = price + commission

        if buyer_wallet.balance < total_price:
            raise ValueError(
                "Недостаточно SB для покупки"
            )

        buyer_wallet.balance -= total_price
        buyer_wallet.save(
            update_fields=['balance']
        )

        seller_wallet.balance += price
        seller_wallet.save(
            update_fields=['balance']
        )

        platform_wallet.balance += commission
        platform_wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        item.user = user
        item.status = "available"

        item.save(
            update_fields=["status"]
        )

        listing.status = 'sold'
        listing.save(
            update_fields=[
                'status',
                'updated_at',
            ]
        )

        WalletTransaction.objects.create(
            user=user,
            amount=-total_price,
            type='shop_purchase',
        )

        WalletTransaction.objects.create(
            user=listing.seller,
            amount=price,
            type='shop_sale',
        )

        WalletTransaction.objects.create(
            user=None,
            amount=commission,
            type='commission',
        )

        log_action(
            user=user,
            action='shop_purchase',
            description=(
                f'Purchased item #{item.id} from listing #{listing.id} '
                f'for {total_price} SB'
            ),
            metadata={
                'listing_id': listing.id,
                'inventory_item_id': item.id,
                'seller_id': listing.seller_id,
                'seller_username': listing.seller.username,
                'price': str(price),
                'commission': str(commission),
                'total_price': str(total_price),
                'buyer_balance': str(buyer_wallet.balance),
            },
        )

        log_action(
            user=listing.seller,
            action='shop_sale',
            description=(
                f'Item #{item.id} sold through listing #{listing.id} '
                f'for {price} SB'
            ),
            metadata={
                'listing_id': listing.id,
                'inventory_item_id': item.id,
                'buyer_id': user.id,
                'buyer_username': user.username,
                'price': str(price),
                'commission': str(commission),
                'seller_balance': str(seller_wallet.balance),
            },
        )

        log_action(
            user=user,
            action='commission',
            description=(
                f'Shop commission for listing #{listing.id}: {commission} SB'
            ),
            metadata={
                'listing_id': listing.id,
                'inventory_item_id': item.id,
                'commission': str(commission),
                'platform_balance': str(platform_wallet.balance),
            },
        )

        return {
            'listing': listing,
            'item': item,
            'price': price,
            'commission': commission,
            'total_price': total_price,
            'buyer_balance': buyer_wallet.balance,
            'seller_balance': seller_wallet.balance,
            'platform_balance': platform_wallet.balance,
        }
def buy_shop_offer(user, offer_id):
    with transaction.atomic():
        try:
            offer = (
                TMMarketOffer.objects
                .select_for_update()
                .get(
                    offer_id=str(offer_id),
                    available=True
                )
            )
        except TMMarketOffer.DoesNotExist:
            raise ValueError(
                'Этот предмет уже недоступен'
            )

        skinbattle_price = (
            offer.tm_price * Decimal('1.02')
        ).quantize(Decimal('0.01'))

        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=user)
        )
        

        if wallet.balance < skinbattle_price:
            raise ValueError(
                'Недостаточно SB для покупки'
            )

        existing_item = InventoryItem.objects.filter(
            tm_offer_id=offer.offer_id
        ).first()

        if existing_item:
            raise ValueError(
                'Этот предмет уже был куплен'
            )

        wallet.balance -= skinbattle_price

        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        inventory_item = InventoryItem.objects.create(
         user=user,
         tm_offer_id=offer.offer_id,
         market_hash_name=offer.market_hash_name,
         tm_price=offer.tm_price,
         skinbattle_price=skinbattle_price,
         icon_url=(
            f'https://steamcommunity-a.akamaihd.net/economy/image/class/730/'
            f'{offer.item_class}/200fx200f'
            if offer.item_class
            else ''
        ),
         float_value=offer.float_value,
         status='available',
    )
        offer.available = False

        offer.save(
            update_fields=[
                'available',
                'updated_at',
            ]
        )

        WalletTransaction.objects.create(
            user=user,
            amount=-skinbattle_price,
            type='shop_purchase',
        )

        log_action(
            user=user,
            action='shop_purchase',
            description=(
                f'Purchased TM Market offer {offer.offer_id} '
                f'for {skinbattle_price} SB'
            ),
            metadata={
                'offer_id': str(offer.offer_id),
                'inventory_item_id': inventory_item.id,
                'market_hash_name': offer.market_hash_name,
                'tm_price': str(offer.tm_price),
                'price': str(skinbattle_price),
                'buyer_balance': str(wallet.balance),
            },
        )

        return {
            'item': inventory_item,
            'offer': offer,
            'price': skinbattle_price,
            'buyer_balance': wallet.balance,
        }
def reserve_shop_offer(user, offer_id):
    with transaction.atomic():
        try:
            offer = (
                TMMarketOffer.objects
                .select_for_update()
                .get(
                    offer_id=str(offer_id),
                    available=True
                )
            )
        except TMMarketOffer.DoesNotExist:
            raise ValueError(
                'Этот предмет уже недоступен'
            )

        skinbattle_price = (
            offer.tm_price * Decimal('1.02')
        ).quantize(Decimal('0.01'))

        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=user)
        )

        if wallet.balance < skinbattle_price:
            raise ValueError(
                'Недостаточно SB для покупки'
            )

        wallet.balance -= skinbattle_price
        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        reservation = ShopReservation.objects.create(
            user=user,
            offer=offer,
            amount=skinbattle_price,
            status='reserved',
        )

        log_action(
            user=user,
            action='shop_purchase',
            description=(
                f'Reserved TM Market offer {offer.offer_id} '
                f'for {skinbattle_price} SB'
            ),
            metadata={
                'reservation_id': reservation.id,
                'offer_id': str(offer.offer_id),
                'amount': str(skinbattle_price),
                'buyer_balance': str(wallet.balance),
                'status': 'reserved',
            },
        )

        return {
            'reservation': reservation,
            'offer': offer,
            'amount': skinbattle_price,
            'buyer_balance': wallet.balance,
        }
def release_shop_reservation(reservation_id):
    with transaction.atomic():
        reservation = (
            ShopReservation.objects
            .select_for_update()
            .select_related('user')
            .get(
                id=reservation_id,
                status='reserved'
            )
        )

        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=reservation.user)
        )

        offer = (
            TMMarketOffer.objects
            .select_for_update()
            .get(id=reservation.offer_id)
        )

        offer.reserved = False
        offer.save(
            update_fields=[
                'reserved',
                'updated_at',
            ]
        )

        wallet.balance += reservation.amount

        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

        reservation.status = 'released'

        reservation.save(
            update_fields=[
                'status',
                'updated_at',
            ]
        )

        log_action(
            user=reservation.user,
            action='shop_purchase',
            description=(
                f'Shop reservation #{reservation.id} released, '
                f'refund {reservation.amount} SB'
            ),
            metadata={
                'reservation_id': reservation.id,
                'offer_id': str(reservation.offer.offer_id) if reservation.offer else None,
                'refund_amount': str(reservation.amount),
                'buyer_balance': str(wallet.balance),
                'status': 'released',
            },
        )

        return {
            'reservation': reservation,
            'refund_amount': reservation.amount,
            'buyer_balance': wallet.balance,
        }
def complete_shop_reservation(reservation_id):
    with transaction.atomic():
        reservation = (
            ShopReservation.objects
            .select_for_update()
            .select_related('user', 'offer')
            .get(
                id=reservation_id,
                status='reserved'
            )
        )

        offer = (
            TMMarketOffer.objects
            .select_for_update()
            .get(
                id=reservation.offer.id,
                available=True
            )
        )

        inventory_item = InventoryItem.objects.create(
            user=reservation.user,
            tm_offer_id=offer.offer_id,
            market_hash_name=offer.market_hash_name,
            tm_price=offer.tm_price,
            skinbattle_price=reservation.amount,
            float_value=offer.float_value,
            status='available',
        )

        offer.available = False
        offer.reserved = False
        offer.save(
            update_fields=[
                'available',
                'reserved',
                'updated_at',
            ]
        )

        reservation.status = 'completed'
        reservation.save(
            update_fields=[
                'status',
                'updated_at',
            ]
        )

        log_action(
            user=reservation.user,
            action='item_received',
            description=(
                f'Received item #{inventory_item.id} from '
                f'TM Market reservation #{reservation.id}'
            ),
            metadata={
                'reservation_id': reservation.id,
                'offer_id': str(offer.offer_id),
                'inventory_item_id': inventory_item.id,
                'market_hash_name': offer.market_hash_name,
                'amount': str(reservation.amount),
                'status': 'completed',
            },
        )

        return {
            'reservation': reservation,
            'item': inventory_item,
            'offer': offer,
        }
def process_shop_purchase(user, offer_id):
    with transaction.atomic():
        try:
            offer = (
                TMMarketOffer.objects
                .select_for_update()
                .get(
                    offer_id=str(offer_id),
                    available=True,
                    reserved=False
                )
            )
        except TMMarketOffer.DoesNotExist:
            raise ValueError(
                'Этот предмет уже недоступен'
            )

        skinbattle_price = (
            offer.tm_price * Decimal('1.02')
        ).quantize(Decimal('0.01'))

        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=user)
        )

        if wallet.balance < skinbattle_price:
            raise ValueError(
                'Недостаточно SB для покупки'
            )

        reservation = ShopReservation.objects.create(
            user=user,
            offer=offer,
            amount=skinbattle_price,
            status='reserved',
        )
        offer.reserved = True
        offer.save(
           update_fields=[
               'reserved',
               'updated_at',
    ]
)

        wallet.balance -= skinbattle_price
        wallet.save(
            update_fields=[
                'balance',
                'updated_at',
            ]
        )

    from .tm_market import check_specific_offer

    tm_offer = check_specific_offer(
        offer.offer_id,
        offer.market_hash_name,
        offer.tm_price,
    )

    if tm_offer is None:
        release_shop_reservation(
            reservation.id
        )

        raise ValueError(
            'Предмет больше недоступен на TM Market'
        )

    result = complete_shop_reservation(
        reservation.id
    )

    log_action(
        user=user,
        action='shop_purchase',
        description=(
            f'Completed TM Market purchase for offer {offer.offer_id}'
        ),
        metadata={
            'reservation_id': reservation.id,
            'offer_id': str(offer.offer_id),
            'inventory_item_id': (
                result['item'].id if result.get('item') else None
            ),
            'amount': str(skinbattle_price),
            'market_hash_name': offer.market_hash_name,
        },
    )

    return result

from django.db import transaction
from django.db.models import Sum

def sell_all_inventory(user):
    with transaction.atomic():
        items = list(
            InventoryItem.objects
            .select_for_update()
            .filter(
                user=user,
                status="available"
            )
        )

        if not items:
            raise ValueError(
                "Нет доступных скинов для продажи"
            )

        total_amount = sum(
            item.skinbattle_price
            for item in items
        )

        if total_amount <= 0:
            raise ValueError(
                "Сумма продажи должна быть больше 0"
            )

        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=user)
        )

        wallet.balance += total_amount
        wallet.save(
            update_fields=[
                "balance",
                "updated_at",
            ]
        )

        for item in items:
            item.status = "sold"
            item.save(
                update_fields=[
                    "status",
                    "updated_at",
                ]
            )

        WalletTransaction.objects.create(
            user=user,
            amount=total_amount,
            type="shop_sale",
        )

        log_action(
            user=user,
            action='shop_sale',
            description=(
                f'Sold all inventory: {len(items)} items for {total_amount} SB'
            ),
            metadata={
                'sold_count': len(items),
                'amount': str(total_amount),
                'balance': str(wallet.balance),
                'inventory_item_ids': [item.id for item in items],
            },
        )

        return {
            "sold_count": len(items),
            "amount": str(total_amount),
            "balance": str(wallet.balance),
        }
def log_action(
    user=None,
    action='',
    description='',
    request=None,
    metadata=None,
):
    """
    Записывает значимое действие пользователя в AuditLog.
    """

    ip_address = None
    user_agent = ''

    if request is not None:
        # Получаем IP пользователя
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')

        if forwarded_for:
            ip_address = forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        # Получаем браузер / устройство
        user_agent = request.META.get(
            'HTTP_USER_AGENT',
            ''
        )

    return AuditLog.objects.create(
        user=user,
        action=action,
        description=description,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata or {},
    )