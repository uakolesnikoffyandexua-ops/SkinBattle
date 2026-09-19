from rest_framework.views import APIView
from rest_framework.response import Response
from decimal import Decimal
from django.contrib.auth import get_user_model


from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework.throttling import UserRateThrottle
from .models import Battle, BattleBet, InventoryItem, TMMarketOffer, ShopListing, Wallet, CustomUser, AuditLog
from .serializers import BattleSerializer, BattleBetSerializer, JoinBattleSerializer, DepositSerializer, ProfileSerializer
from .services import create_battle, join_battle, start_battle, process_battle, verify_battle_result, get_user_battle_history, get_user_battle_stats, get_wallet_transactions, deposit, leave_battle, buy_shop_listing, buy_shop_offer, sell_all_inventory, log_action, log_action
from rest_framework.permissions import IsAuthenticated
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.shortcuts import redirect
from .steam_auth import (
    build_steam_login_url,
    verify_steam_response,
    extract_steam_id,
    get_or_create_steam_user,
    get_user_token,
    get_steam_profile,
)

class SteamLoginView(APIView):
    def get(self, request):
        callback_url = request.build_absolute_uri(
            '/api/auth/steam/callback/'
        )

        login_url = build_steam_login_url(
            callback_url
        )

        return redirect(login_url)

class SteamCallbackView(APIView):
    def get(self, request):
        params = request.query_params.dict()

        if not verify_steam_response(params):
            return Response(
                {
                    'error': 'Steam authentication failed'
                },
                status=400
            )

        claimed_id = params.get(
            'openid.claimed_id'
        )

        if not claimed_id:
            return Response(
                {
                    'error': 'SteamID не найден'
                },
                status=400
            )

        steam_id = extract_steam_id(
            claimed_id
        )

        steam_profile = get_steam_profile(
            steam_id
        )

        user, created = get_or_create_steam_user(
            steam_id
        )

        personaname = steam_profile.get(
            'personaname',
            ''
        ).strip()

        if personaname:
            User = get_user_model()

            username_exists = User.objects.exclude(
                id=user.id
            ).filter(
                username=personaname
            ).exists()

            if not username_exists:
                user.username = personaname

        user.avatar_url = steam_profile.get(
            'avatarfull',
            ''
        )

        user.save(
            update_fields=[
                'username',
                'avatar_url',
            ]
        )

        token = get_user_token(user)

        return redirect(
            f'https://skinbattel.ru/#token={token}'
        )
    
class BattleListView(APIView):

    def get(self, request):
        battles = Battle.objects.filter(
            status__in=['waiting', 'active']
        ).order_by('-created_at')

        result = []

        for battle in battles:
            battle_serializer = BattleSerializer(battle)

            bets = BattleBet.objects.filter(
                battle=battle
            ).select_related('user')

            bets_serializer = BattleBetSerializer(
                bets,
                many=True
            )

            data = battle_serializer.data
            data['bets'] = bets_serializer.data

            result.append(data)

        return Response(result)
    
class BattleDetailView(APIView):

    def get(self, request, battle_id):
        try:
            battle = Battle.objects.get(id=battle_id)
        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        battle_serializer = BattleSerializer(battle)

        bets = BattleBet.objects.filter(
            battle=battle
        ).select_related('user')

        bets_serializer = BattleBetSerializer(
            bets,
            many=True
        )

        data = battle_serializer.data

        data['bets'] = bets_serializer.data

        return Response(data)

class BattleCreateThrottle(UserRateThrottle):
    rate = '1/m'
    
class BattleCreateView(APIView):

    permission_classes = [IsAuthenticated]
    throttle_classes = [BattleCreateThrottle]

    def post(self, request):
        max_players = request.data.get(
            'max_players',
            10
        )

        try:
            max_players = int(max_players)
        except (TypeError, ValueError):
            return Response(
                {'error': 'max_players должен быть числом'},
                status=400
            )

        try:
            battle = create_battle(
                max_players=max_players,
                user=request.user,
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )

        serializer = BattleSerializer(battle)

        return Response(
            serializer.data,
            status=201
        )

class JoinBattleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, battle_id):
        serializer = JoinBattleSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=400
            )

        inventory_item_id = serializer.validated_data[
            'inventory_item_id'
        ]
        print(
             "JOIN DEBUG:",
             "user_id =", request.user.id,
             "username =", request.user.username,
             "inventory_item_id =", inventory_item_id,
            )

        try:
            inventory_item = InventoryItem.objects.get(
                id=inventory_item_id,
                user=request.user
            )

            print(
                  "JOIN DEBUG:",
                  "request.user.id =", request.user.id,
                  "request.user.username =", request.user.username,
                  "inventory_item_id =", inventory_item_id,
            )

            print(
                 "JOIN DEBUG ITEM:",
                "id =", inventory_item.id,
                "user_id =", inventory_item.user_id,
                "name =", inventory_item.market_hash_name,
            )

        except InventoryItem.DoesNotExist:
            return Response(
                {
                    'error':
                    'Предмет не найден в вашем инвентаре'
                },
                status=400
            )

        try:
            result = join_battle(
                battle_id=battle_id,
                user=request.user,
                inventory_item=inventory_item
            )

        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )
        log_action(
            user=request.user,
            action='battle_joined',
            description=(
                f'Joined Battle #{battle_id} '
                f'with item #{result["bet"].inventory_item_id} '
                f'for {result["bet"].amount}'
            ),
            request=request,
            metadata={
                'battle_id': battle_id,
                'user_id': request.user.id,
                'username': request.user.username,
                'inventory_item_id': result['bet'].inventory_item_id,
                'amount': str(result['bet'].amount),
                'battle_bank': str(result['battle_bank']),
            },
        )

        # Сообщаем всем клиентам,
        # что новый игрок вошёл.
        channel_layer = get_channel_layer()

        async_to_sync(
            channel_layer.group_send
        )(
            f'battle_{battle_id}',
            {
                'type': 'battle_update',
                'event': 'PLAYER_JOINED',
                'battle_id': battle_id,
                'username': request.user.username,
                'amount': float(
                    result['bet'].amount
                ),
                'battle_bank': float(
                    result['battle_bank']
                ),
            }
        )

        async_to_sync(
            channel_layer.group_send
        )(
            'battle_lobby',
            {
                'type': 'lobby_update',
                'event': 'PLAYER_JOINED',
                'battle_id': battle_id,
                'username': request.user.username,
                'amount': float(
                    result['bet'].amount
                ),
                'battle_bank': float(
                    result['battle_bank']
                ),
                'status': 'waiting',
            }
        )

        # Проверяем, заполнена ли Battle полностью.
        battle = Battle.objects.get(
            id=battle_id
        )

        if (
            battle.status == 'waiting'
            and battle.bets.count()
            >= battle.max_players
        ):
            try:
                start_result = start_battle(
                    battle_id
                )

                # Сообщаем всем участникам,
                # что Battle автоматически стартовала.
                async_to_sync(
                    channel_layer.group_send
                )(
                    f'battle_{battle_id}',
                    {
                        'type': 'battle_update',
                        'event': 'BATTLE_STARTED',
                        'battle_id': battle_id,
                    }
                )

                result['auto_started'] = True

            except ValueError:
                result['auto_started'] = False

        else:
            result['auto_started'] = False

        return Response(
            {
                'message': 'Вы вошли в Battle',
                'battle_id': battle_id,
                'username': request.user.username,
                'amount': result['bet'].amount,
                'battle_bank': result['battle_bank'],
                'inventory_item_id': result['bet'].inventory_item_id,
                'auto_started': result['auto_started'],
            },
            status=200
        )
class LeaveBattleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, battle_id):
        try:
            result = leave_battle(
                battle_id=battle_id,
                user=request.user
            )

        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )

        # Отправляем событие всем участникам Battle
        channel_layer = get_channel_layer()

        async_to_sync(channel_layer.group_send)(
            f'battle_{battle_id}',
            {
                'type': 'battle_update',
                'event': 'PLAYER_LEFT',
                'battle_id': battle_id,
                'username': request.user.username,
                'refund_amount': float(
                    result['refund_amount']
                ),
                'battle_bank': float(
                    result['battle_bank']
                ),
            }
        )

        return Response(
            {
                'message': 'Вы вышли из Battle',
                'battle_id': battle_id,
                'username': request.user.username,
                'refund_amount': result['refund_amount'],
                'new_balance': result['new_balance'],
                'battle_bank': result['battle_bank'],
            },
            status=200
        )
    
class StartBattleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, battle_id):
        try:
            result = start_battle(battle_id)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )
        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        # Отправляем событие всем участникам Battle
        channel_layer = get_channel_layer()

        async_to_sync(channel_layer.group_send)(
            f'battle_{battle_id}',
            {
                'type': 'battle_update',
                'event': 'BATTLE_STARTED',
                'battle_id': battle_id,
            }
        )

        return Response(
            result,
            status=200
        )
class ProcessBattleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, battle_id):
        try:
            result = process_battle(battle_id)

        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )

        # Если Battle завершилась —
        # отправляем результат всем подключённым игрокам
        if result.get('winner'):
            channel_layer = get_channel_layer()

            async_to_sync(channel_layer.group_send)(
                f'battle_{battle_id}',
                {
                    'type': 'battle_update',
                    'event': 'BATTLE_FINISHED',
                    'battle_id': battle_id,
                    'winner': result.get('winner'),
                    'total_bank': result.get('total_bank'),
                    'commission': result.get('commission'),
                    'prize': result.get('prize'),
                }
            )

        return Response(
            result,
            status=200
        )
class FairnessView(APIView):

    def get(self, request, battle_id):
        try:
            battle = Battle.objects.get(
                id=battle_id
            )
        except Battle.DoesNotExist:
            return Response(
                {'error': 'Battle не найдена'},
                status=404
            )

        if battle.status != 'finished':
            return Response(
                {
                    'battle_id': battle.id,
                    'status': battle.status,
                    'server_seed_hash': battle.server_seed_hash,
                    'message': 'Server Seed будет раскрыт после завершения Battle'
                },
                status=200
            )

        try:
            verification = verify_battle_result(
                battle
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )

        return Response(
            {
                'battle_id': battle.id,
                'status': battle.status,

                'server_seed_hash':
                    battle.server_seed_hash,

                'server_seed':
                    battle.server_seed,

                'nonce':
                    battle.nonce,

                'hash':
                    verification['hash'],

                'random_value':
                    verification['random_value'],

                'calculated_winner':
                    verification['calculated_winner'],

                'actual_winner':
                    verification['actual_winner'],

                'hash_valid':
                    verification['hash_valid'],

                'winner_valid':
                    verification['winner_valid'],
            },
            status=200
        )
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'id': request.user.id,
            'username': request.user.username,
            'avatar_url': request.user.avatar_url,
            'is_staff': request.user.is_staff,
            'balance': request.user.wallet.balance,
        })
class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = ProfileSerializer(request.user)

        return Response(serializer.data)

    def patch(self, request):
        serializer = ProfileSerializer(
            request.user,
            data=request.data,
            partial=True
        )

        if serializer.is_valid():
            serializer.save()

            return Response(serializer.data)

        return Response(
            serializer.errors,
            status=400
        )
class BattleHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        history = get_user_battle_history(
            request.user
        )

        return Response(history)
class BattleStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        stats = get_user_battle_stats(
            request.user
        )

        return Response({
            'username': request.user.username,
            'balance': request.user.wallet.balance,
            **stats,
        })
class WalletTransactionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        transactions = get_wallet_transactions(
            request.user
        )

        return Response(transactions)
class DepositView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DepositSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        amount = serializer.validated_data['amount']

        try:
            result = deposit(
                user=request.user,
                amount=amount
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=400
            )

        return Response(
            {
                'message': 'Баланс успешно пополнен',
                'amount': amount,
                'new_balance': result['new_balance'],
            },
            status=200
        )
class InventoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = (
            InventoryItem.objects
            .filter(
                user=request.user,
                status__in=[
                    'available',
                    'in_battle',
                    'frozen',
                    'withdraw_pending',
                ]
            )
            .order_by('-created_at')
        )

        data = []

        for item in items:
            data.append({
                'id': item.id,

                'tm_offer_id': item.tm_offer_id,

                'market_hash_name': item.market_hash_name,

                'tm_price': (
                    str(item.tm_price)
                    if item.tm_price is not None
                    else None
                ),

                'skinbattle_price': (
                    str(item.skinbattle_price)
                    if item.skinbattle_price is not None
                    else None
                ),

                'icon_url': item.icon_url,

                'float_value': (
                    str(item.float_value)
                    if item.float_value is not None
                    else None
                ),

                'status': item.status,
            })

        return Response(data)


class ShopOffersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        offers = (
            TMMarketOffer.objects
            .filter(available=True)
            .order_by('tm_price')
        )

        data = []

        for offer in offers:
            skinbattle_price = round(
                offer.tm_price * Decimal("1.02"),
                2
            )

            data.append({
                'offer_id': offer.offer_id,
                'market_hash_name': offer.market_hash_name,
                'tm_price': str(offer.tm_price),
                'skinbattle_price': str(skinbattle_price),
                'item_class': offer.item_class,
                'item_instance': offer.item_instance,
                'source': offer.source,
                'float_value': str(offer.float_value) if offer.float_value else None,
                'phase': offer.phase,
                'icon_url': (
                f'https://steamcommunity-a.akamaihd.net/economy/image/class/730/'
                f'{offer.item_class}/200fx200f'
                if offer.item_class
                else ''
                 ),
            })

        return Response(data)

class ShopBuyOfferView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, offer_id):
        try:
            result = buy_shop_offer(
                user=request.user,
                offer_id=offer_id
            )

            return Response({
                'success': True,
                'message': 'Предмет успешно приобретён',
                'item_id': result['item'].id,
                'offer_id': result['offer'].offer_id,
                'market_hash_name': result['item'].market_hash_name,
                'price': str(result['price']),
                'buyer_balance': str(result['buyer_balance']),
            })

        except ValueError as e:
            return Response({
                'success': False,
                'message': str(e),
            }, status=400)
        
class ShopListingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        listings = (
            ShopListing.objects
            .filter(status='active')
            .select_related('item', 'seller')
            .order_by('-created_at')
        )

        data = []

        for listing in listings:
            data.append({
                'id': listing.id,
                'item_id': listing.item_id,
                'market_hash_name': listing.item.market_hash_name,
                'icon_url': listing.item.icon_url,
                'price': str(listing.price),
                'seller': listing.seller.username,
                'created_at': listing.created_at,
            })

        return Response(data)

    
class ShopBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, listing_id):
        try:
            result = buy_shop_listing(
                user=request.user,
                listing_id=listing_id
            )

            return Response({
                'success': True,
                'listing_id': result['listing'].id,
                'item_id': result['item'].id,
                'price': str(result['price']),
                'commission': str(result['commission']),
                'total_price': str(result['total_price']),
                'buyer_balance': str(result['buyer_balance']),
            })

        except ValueError as error:
            return Response(
                {
                    'success': False,
                    'error': str(error),
                },
                status=400
            )

        except ShopListing.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'error': 'Объявление не найдено',
                },
                status=404
            )
class SellAllInventoryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            result = sell_all_inventory(
                request.user
            )

            return Response(
                result,
                status=200
            )

        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=400
            )

        except Wallet.DoesNotExist:
            return Response(
                {"error": "Кошелёк пользователя не найден"},
                status=400
            )
class ShopBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, listing_id):
        try:
            result = buy_shop_listing(
                user=request.user,
                listing_id=listing_id
            )

            return Response({
                'success': True,
                'listing_id': result['listing'].id,
                'item_id': result['item'].id,
                'price': str(result['price']),
                'commission': str(result['commission']),
                'total_price': str(result['total_price']),
                'buyer_balance': str(result['buyer_balance']),
            })

        except ValueError as error:
            return Response(
                {
                    'success': False,
                    'error': str(error),
                },
                status=400
            )

        except ShopListing.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'error': 'Объявление не найдено',
                },
                status=404
            )
class ShopSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .tm_market import search_shop_offers

        query = request.query_params.get(
            'q',
            ''
        ).strip()

        min_price = request.query_params.get(
            'min_price'
        )

        max_price = request.query_params.get(
            'max_price'
        )

        page = request.query_params.get(
            'page',
            '1'
        )

        if (
            not query
            and not min_price
            and not max_price
        ):
            return Response({
                'results': [],
                'page': 1,
                'has_more': False,
            })

        try:
            page = int(page)

            if page < 1:
                page = 1

            result = search_shop_offers(
                query=query,
                min_price=min_price,
                max_price=max_price,
                page=page,
            )

        except Exception as error:
            return Response(
                {
                    'success': False,
                    'error': str(error),
                },
                status=502,
            )

        return Response(result)
class ShopFeaturedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .tm_market import get_featured_shop_offers

        try:
            result = get_featured_shop_offers(
                limit=12
            )

        except Exception as error:
            return Response(
                {
                    'success': False,
                    'error': str(error),
                },
                status=502,
            )

        return Response({
            'results': result,
        })
    
class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response(
                {'detail': 'Admin access required.'},
                status=403
            )

        from django.db.models import Sum

        users_count = CustomUser.objects.count()
        battles_count = Battle.objects.count()
        inventory_count = InventoryItem.objects.count()

        pending_withdrawals = InventoryItem.objects.filter(
            status='withdraw_pending'
        ).count()

        total_balance = Wallet.objects.aggregate(
            total=Sum('balance')
        )['total'] or Decimal('0.00')

        return Response({
            'users': users_count,
            'battles': battles_count,
            'inventory_items': inventory_count,
            'pending_withdrawals': pending_withdrawals,
            'total_balance': total_balance,
        })
class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response(
                {'detail': 'Admin access required.'},
                status=403
            )

        query = request.query_params.get('q', '').strip()

        users = CustomUser.objects.all().order_by('-id')

        if query:
            users = users.filter(
                username__icontains=query
            ) | users.filter(
                steam_id__icontains=query
            )

        result = []

        for user in users[:100]:
            wallet = Wallet.objects.filter(
                user=user
            ).first()

            inventory_count = InventoryItem.objects.filter(
                user=user
            ).count()

            battles_count = BattleBet.objects.filter(
                user=user
            ).count()

            result.append({
                'id': user.id,
                'username': user.username,
                'steam_id': user.steam_id,
                'avatar_url': user.avatar_url,
                'balance': str(
                    wallet.balance
                    if wallet
                    else Decimal('0.00')
                ),
                'inventory_count': inventory_count,
                'battles_count': battles_count,
                'is_staff': user.is_staff,
                'is_active': user.is_active,
                'date_joined': user.date_joined,
                'role': user.role,
            })

        return Response({
            'users': result,
            'count': len(result),
        })
class AdminUserRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        # Только администратор может менять роли
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admin can change user roles.'},
                status=403
            )

        try:
            user = CustomUser.objects.get(id=user_id)
        except CustomUser.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=404
            )

        new_role = request.data.get('role')

        old_role = user.role

        if new_role not in ['user', 'manager', 'admin']:
            return Response(
                {'detail': 'Invalid role.'},
                status=400
            )

        user.role = new_role

        # Для нашей Admin Panel:
        # manager и admin получают is_staff=True
        if new_role in ['manager', 'admin']:
            user.is_staff = True
        else:
            user.is_staff = False

        user.save(update_fields=['role', 'is_staff'])

        log_action(
          user=request.user,
          action='role_changed',
          description=f'Changed role for {user.username}: {old_role} -> {new_role}',
          request=request,
          metadata={
        'target_user_id': user.id,
        'target_username': user.username,
        'old_role': old_role,
        'new_role': new_role,
    },
)

        return Response({
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'is_staff': user.is_staff,
        })
class AdminUserBanView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        # Только Admin может банить пользователей
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admin can ban users.'},
                status=403
            )

        # Нельзя забанить самого себя
        if request.user.id == user_id:
            return Response(
                {'detail': 'You cannot ban yourself.'},
                status=400
            )

        try:
            user = CustomUser.objects.get(id=user_id)
        except CustomUser.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=404
            )

        # Пока не разрешаем банить другого Admin
        if user.role == 'admin':
            return Response(
                {'detail': 'You cannot ban another admin.'},
                status=403
            )

        banned = request.data.get('banned')

        if not isinstance(banned, bool):
            return Response(
                {'detail': 'banned must be true or false.'},
                status=400
            )

        user.is_active = not banned
        user.save(update_fields=['is_active'])

        action = 'user_banned' if banned else 'user_unbanned'

        description = (
          f'User banned: {user.username}'
        if banned
        else f'User unbanned: {user.username}'
        )

        log_action(
           user=request.user,
           action=action,
           description=description,
           request=request,
           metadata={
        'target_user_id': user.id,
        'target_username': user.username,
    },
)

        return Response({
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'is_active': user.is_active,
        })

class AdminAuditLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Только Admin может просматривать логи
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admin can view audit logs.'},
                status=403
            )

        # Получаем параметры фильтрации
        search = request.query_params.get('search', '').strip()
        action = request.query_params.get('action', '').strip()
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()

        # Базовый запрос
        logs = AuditLog.objects.select_related('user').all()

        # Поиск
        if search:
            logs = logs.filter(
                Q(user__username__icontains=search)
                | Q(action__icontains=search)
                | Q(description__icontains=search)
                | Q(ip_address__icontains=search)
            )

        # Фильтр по действию
        if action:
            logs = logs.filter(action=action)

        # Фильтр "дата от"
        if date_from:
            parsed_date_from = parse_date(date_from)

            if parsed_date_from:
                logs = logs.filter(
                    created_at__date__gte=parsed_date_from
                )

        # Фильтр "дата до"
        if date_to:
            parsed_date_to = parse_date(date_to)

            if parsed_date_to:
                logs = logs.filter(
                    created_at__date__lte=parsed_date_to
                )

        # Сначала самые новые события
        logs = logs.order_by('-created_at')

        # Общее количество после фильтрации
        total_count = logs.count()

        # Пока ограничиваем выдачу 500 записями
        logs = logs[:500]

        data = []

        for log in logs:
            data.append({
                'id': log.id,
                'user_id': log.user.id if log.user else None,
                'username': log.user.username if log.user else 'Unknown',
                'action': log.action,
                'description': log.description,
                'ip_address': log.ip_address,
                'user_agent': log.user_agent,
                'metadata': log.metadata,
                'created_at': log.created_at,
            })

        return Response({
            'logs': data,
            'count': total_count,
        })