"""
URL configuration for mysite_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path

from accounts.views import (
    BattleListView,
    BattleDetailView,
    BattleCreateView,
    JoinBattleView,
    StartBattleView,
    ProcessBattleView,
    FairnessView,
    MeView,
    ProfileView,
    BattleStatsView,
    SteamLoginView,
    SteamCallbackView,
    WalletTransactionsView,
    DepositView,
    LeaveBattleView,
    InventoryView,
    ShopListingsView,
    ShopBuyView,
    ShopOffersView,
    ShopBuyOfferView,
    ShopSearchView,
    SellAllInventoryView,
    AdminDashboardView,
    AdminUsersView,
    AdminUserRoleView,
    AdminUserBanView,
    AdminAuditLogsView,
)

urlpatterns = [
    path('admin/', admin.site.urls),

    path(
    'api/auth/steam/',
    SteamLoginView.as_view(),
    ),

    path(
    'api/auth/steam/callback/',
    SteamCallbackView.as_view(),
    ),

    path(
        'api/battles/',
        BattleListView.as_view()
    ),

    path(
        'api/battles/<int:battle_id>/',
        BattleDetailView.as_view()
    ),

    path(
    'api/admin/dashboard/',
    AdminDashboardView.as_view(),
    ),
    
    path(
    'api/admin/users/',
    AdminUsersView.as_view(),
    ),

    path(
        'api/battles/create/',
        BattleCreateView.as_view()
    ),

    path(
        'api/battles/<int:battle_id>/join/',
        JoinBattleView.as_view()
    ),

   path(
    'api/battles/<int:battle_id>/leave/',
    LeaveBattleView.as_view()
    ), 

    path(
    'api/battles/<int:battle_id>/start/',
    StartBattleView.as_view()
    ),

    path(
    'api/battles/<int:battle_id>/process/',
    ProcessBattleView.as_view()
    ),
    path(
    'api/battles/<int:battle_id>/fairness/',
    FairnessView.as_view()
    ),
    path(
    'api/me/',
    MeView.as_view()
    ),
    path(
    'api/profile/',
    ProfileView.as_view()
    ),
     path(
    'api/battles/stats/',
    BattleStatsView.as_view()
    ),
    path(
    'api/wallet/transactions/',
    WalletTransactionsView.as_view()
    ),
    path(
    'api/wallet/deposit/',
    DepositView.as_view()
    ),
    path(
    'api/inventory/',
    InventoryView.as_view()
    ),

    path(
    "api/inventory/sell-all/",
    SellAllInventoryView.as_view()
    ),

    path(
    'api/shop/offers/',
    ShopOffersView.as_view(),
    name='shop-offers'
    ),
    path('shop/', ShopListingsView.as_view(), name='shop-listings'),

    path(
    'shop/<int:listing_id>/buy/',
    ShopBuyView.as_view(),
    name='shop-buy'
    ),
    path(
    'api/shop/offers/<str:offer_id>/buy/',
    ShopBuyOfferView.as_view(),
    name='shop-buy-offer'
    ),
    path(
    'api/shop/search/',
    ShopSearchView.as_view(),
    name='shop-search',
    ),
    path(
    'api/admin/users/<int:user_id>/role/',
    AdminUserRoleView.as_view(),
    ),
    path(
    'api/admin/users/<int:user_id>/ban/',
    AdminUserBanView.as_view(),
    ),
    path(
    'api/admin/audit-logs/',
    AdminAuditLogsView.as_view(),
    ),

]