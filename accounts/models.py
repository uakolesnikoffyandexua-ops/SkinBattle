from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('manager', 'Manager'),
        ('admin', 'Admin'),
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='user',
    )

    avatar_url = models.URLField(blank=True, null=True)
    steam_id = models.CharField(max_length=30, blank=True)
    trade_token = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    bio = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    birth_date = models.DateField(blank=True, null=True)

class Wallet(models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='wallet'
    )

    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} — {self.balance} ₽"
    
class Battle(models.Model):
    STATUS_CHOICES = [
        ('waiting', 'Ожидание'),
        ('active', 'Активна'),
        ('finished', 'Завершена'),
    ]

    server_seed_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True
    )

    created_by = models.ForeignKey(
    'CustomUser',
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name='created_battles',
    )

    server_seed = models.CharField(
        max_length=64,
        blank=True,
        null=True
    )

    nonce = models.PositiveIntegerField(
        default=0
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='waiting'
    )
    max_players = models.PositiveIntegerField(
    default=10
    )

    total_bank = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    winner = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='won_battles'
    )

    commission = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)

    started_at = models.DateTimeField(
    null=True,
    blank=True
    )

    finished_at = models.DateTimeField(
        null=True,
        blank=True
    )

    def __str__(self):
        return f"Battle #{self.id}"
    
class BattleBet(models.Model):
    battle = models.ForeignKey(
        Battle,
        on_delete=models.CASCADE,
        related_name='bets'
    )

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='battle_bets'
    )

    inventory_item = models.ForeignKey(
        'InventoryItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='battle_bets'
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['battle', 'user'],
                name='unique_battle_user'
            )
        ]

    def __str__(self):
        return f"{self.user.username} — {self.amount} ₽"
    
class WalletTransaction(models.Model):
    TYPE_CHOICES = [
    ('bet', 'Ставка'),
    ('win', 'Выигрыш'),
    ('commission', 'Комиссия'),
    ('deposit', 'Пополнение'),
    ('withdraw', 'Вывод'),
    ('shop_purchase', 'Покупка в магазине'),
    ('shop_sale', 'Продажа в магазине'),
    ]

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='wallet_transactions'
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES
    )

    battle = models.ForeignKey(
        Battle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        username = self.user.username if self.user else 'SYSTEM'
        return f"{username} — {self.amount} ₽ — {self.type}"
class PlatformWallet(models.Model):
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Platform Wallet — {self.balance} SB'

class InventoryItem(models.Model):
    STATUS_CHOICES = [
        ('available', 'Доступен'),
        ('in_battle', 'В Battle'),
        ('frozen', 'Заморожен'),
        ('withdraw_pending', 'Выводится'),
        ('delivered', 'Выведен'),
        ('invalid', 'Недействителен'),
        ('sold', 'Продан'),
    ]

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='inventory_items'
    )

    # Данные конкретного предложения TM Market
    tm_offer_id = models.CharField(
    max_length=100,
    unique=True,
    null=True,
    blank=True
    )

    market_hash_name = models.CharField(
        max_length=255
    )

    tm_price = models.DecimalField(
    max_digits=12,
    decimal_places=2,
    null=True,
    blank=True
    )

    # Цена токена внутри SkinBattle.
    # Это TM Market цена + 2% на момент получения токена.
    skinbattle_price = models.DecimalField(
    max_digits=12,
    decimal_places=2,
    null=True,
    blank=True
    )

    icon_url = models.URLField(
        blank=True
    )

    float_value = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        null=True,
        blank=True
    )

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='available'
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f'{self.market_hash_name} — {self.skinbattle_price} SB'
class TMMarketOffer(models.Model):
    offer_id = models.CharField(
        max_length=100,
        unique=True
    )

    market_hash_name = models.CharField(
        max_length=255
    )

    tm_price = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    item_class = models.CharField(
        max_length=100,
        blank=True
    )

    item_instance = models.CharField(
        max_length=100,
        blank=True
    )

    source = models.CharField(
        max_length=50,
        blank=True
    )

    float_value = models.DecimalField(
        max_digits=12,
        decimal_places=10,
        null=True,
        blank=True
    )

    phase = models.CharField(
        max_length=100,
        blank=True 
    )

    available = models.BooleanField(
        default=True
    )
    reserved = models.BooleanField(
        default=False
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f'{self.market_hash_name} — {self.tm_price} ₽'
class ShopListing(models.Model):
    STATUS_CHOICES = [
        ('active', 'Активно'),
        ('sold', 'Продано'),
        ('cancelled', 'Отменено'),
    ]

    item = models.ForeignKey(
    InventoryItem,
    on_delete=models.CASCADE,
    related_name='shop_listings'
    )

    seller = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='shop_listings'
    )

    price = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return (
            f'{self.item.market_hash_name} — '
            f'{self.price} SB'
        )

class ShopReservation(models.Model):
    STATUS_CHOICES = [
        ('reserved', 'Зарезервировано'),
        ('completed', 'Завершено'),
        ('released', 'Освобождено'),
    ]

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='shop_reservations'
    )

    offer = models.ForeignKey(
        TMMarketOffer,
        on_delete=models.PROTECT,
        related_name='reservations'
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='reserved'
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return (
            f'{self.user.username} — '
            f'{self.offer.offer_id} — '
            f'{self.amount} SB — '
            f'{self.status}'
        )
class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('login_failed', 'Login failed'),

        ('profile_updated', 'Profile updated'),

        ('battle_created', 'Battle created'),
        ('battle_joined', 'Battle joined'),
        ('battle_left', 'Battle left'),
        ('bet_placed', 'Bet placed'),
        ('battle_started', 'Battle started'),
        ('battle_finished', 'Battle finished'),
        ('battle_cancelled', 'Battle cancelled'),

        ('item_received', 'Item received'),
        ('item_locked', 'Item locked'),
        ('item_unlocked', 'Item unlocked'),
        ('item_sold', 'Item sold'),
        ('withdraw_requested', 'Withdraw requested'),
        ('item_withdrawn', 'Item withdrawn'),

        ('deposit', 'Deposit'),
        ('withdraw', 'Withdraw'),
        ('bet_charge', 'Bet charge'),
        ('win', 'Win'),
        ('commission', 'Commission'),
        ('shop_purchase', 'Shop purchase'),
        ('shop_sale', 'Shop sale'),

        ('user_banned', 'User banned'),
        ('user_unbanned', 'User unbanned'),
        ('role_changed', 'Role changed'),
        ('user_activated', 'User activated'),
    )

    user = models.ForeignKey(
        'CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )

    action = models.CharField(
        max_length=50,
        choices=ACTION_CHOICES,
    )

    description = models.TextField(
        blank=True,
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
    )

    user_agent = models.TextField(
        blank=True,
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        username = self.user.username if self.user else 'Unknown'
        return f'{username} — {self.action} — {self.created_at}'

class ChatMessage(models.Model):
    user = models.ForeignKey(
        'CustomUser',
        on_delete=models.CASCADE,
        related_name='chat_messages',
    )

    message = models.CharField(
        max_length=300
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.user.username}: {self.message[:50]}'