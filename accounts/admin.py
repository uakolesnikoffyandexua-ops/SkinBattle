from django.contrib import admin
from .models import CustomUser, Wallet, Battle, BattleBet, WalletTransaction



admin.site.register(Wallet)
admin.site.register(Battle)
admin.site.register(BattleBet)
admin.site.register(WalletTransaction)
admin.site.register(CustomUser)