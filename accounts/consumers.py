from channels.generic.websocket import AsyncWebsocketConsumer
import json
from decimal import Decimal
from channels.db import database_sync_to_async
from accounts.models import ChatMessage


class BattleConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.battle_id = self.scope['url_route']['kwargs']['battle_id']

        self.battle_group_name = f'battle_{self.battle_id}'

        await self.channel_layer.group_add(
            self.battle_group_name,
            self.channel_name
        )

        await self.accept()

        await self.send(
            text_data=json.dumps({
                'event': 'CONNECTED',
                'battle_id': self.battle_id,
            })
        )

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
           return

        try:
             data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if data.get('type') == 'ping':
             await self.send(
            text_data=json.dumps({
                'type': 'pong',
            })
        )
        return

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.battle_group_name,
            self.channel_name
        )

    async def battle_update(self, event):
        await self.send(
            text_data=json.dumps({
                'event': event['event'],
                'battle_id': event['battle_id'],
                'username': event.get('username'),
                'amount': self.serialize_value(
                    event.get('amount')
                ),
                'battle_bank': self.serialize_value(
                    event.get('battle_bank')
                ),
                'winner': event.get('winner'),
                'total_bank': self.serialize_value(
                    event.get('total_bank')
                ),
                'commission': self.serialize_value(
                    event.get('commission')
                ),
                'prize': self.serialize_value(
                    event.get('prize')
                ),
            })
        )

    @staticmethod
    def serialize_value(value):
        if isinstance(value, Decimal):
            return float(value)

        return value
    
class LobbyConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.lobby_group_name = 'battle_lobby'

        await self.channel_layer.group_add(
            self.lobby_group_name,
            self.channel_name
        )

        await self.accept()

        await self.send(
            text_data=json.dumps({
                'event': 'LOBBY_CONNECTED'
            })
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.lobby_group_name,
            self.channel_name
        )

    async def lobby_update(self, event):
        await self.send(
            text_data=json.dumps({
                'event': event.get('event'),
                'battle_id': event.get('battle_id'),
                'username': event.get('username'),
                'amount': self.serialize_value(
                    event.get('amount')
                ),
                'battle_bank': self.serialize_value(
                    event.get('battle_bank')
                ),
                'status': event.get('status'),
            })
        )

    @staticmethod
    def serialize_value(value):
        if isinstance(value, Decimal):
            return float(value)

        return value
class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.chat_group_name = 'global_chat'

        self.user = self.scope.get('user')

        if not self.user or self.user.is_anonymous:
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(
            self.chat_group_name,
            self.channel_name
        )

        await self.accept()

        await self.send(
            text_data=json.dumps({
                'event': 'CHAT_CONNECTED',
                'username': self.user.username,
            })
        )

        # Отправляем последние 50 сообщений
        messages = await self.get_recent_messages()

        for message in messages:
            await self.send(
                text_data=json.dumps({
                    'event': 'CHAT_MESSAGE',
                    'id': message['id'],
                    'user_id': message['user_id'],
                    'username': message['username'],
                    'avatar_url': message['avatar_url'],
                    'message': message['message'],
                    'created_at': message['created_at'],
                })
            )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.chat_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if data.get('type') == 'ping':
          await self.send(
            text_data=json.dumps({
                'type': 'pong',
            })
          )
          return
    
        message = str(
            data.get('message', '')
        ).strip()

        if not message:
            return

        if len(message) > 300:
            message = message[:300]

        chat_message = await self.save_message(message)

        await self.channel_layer.group_send(
            self.chat_group_name,
            {
                'type': 'chat_message',
                'id': chat_message['id'],
                'user_id': self.user.id,
                'username': self.user.username,
                'avatar_url': self.user.avatar_url or '',
                'message': chat_message['message'],
                'created_at': chat_message['created_at'],
            }
        )

    async def chat_message(self, event):
        await self.send(
            text_data=json.dumps({
                'event': 'CHAT_MESSAGE',
                'id': event['id'],
                'user_id': event['user_id'],
                'username': event['username'],
                'avatar_url': event['avatar_url'],
                'message': event['message'],
                'created_at': event['created_at'],
            })
        )

    @database_sync_to_async
    def save_message(self, message):
        chat_message = ChatMessage.objects.create(
            user=self.user,
            message=message,
        )

        return {
            'id': chat_message.id,
            'message': chat_message.message,
            'created_at': chat_message.created_at.isoformat(),
        }

    @database_sync_to_async
    def get_recent_messages(self):
        messages = (
            ChatMessage.objects
            .select_related('user')
            .order_by('-created_at')[:50]
        )

        messages = list(reversed(messages))

        return [
            {
                'id': message.id,
                'user_id': message.user.id,
                'username': message.user.username,
                'avatar_url': message.user.avatar_url or '',
                'message': message.message,
                'created_at': message.created_at.isoformat(),
            }
            for message in messages
        ]