from django.urls import path
from .consumers import BattleConsumer, LobbyConsumer, ChatConsumer

websocket_urlpatterns = [
    path(
        'ws/battles/<int:battle_id>/',
        BattleConsumer.as_asgi()
    ),

    path(
        'ws/lobby/',
        LobbyConsumer.as_asgi()
    ),
    path(
        'ws/chat/',
        ChatConsumer.as_asgi()
    ),
]