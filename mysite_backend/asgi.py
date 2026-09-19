"""
ASGI config for mysite_backend project.
"""

import os

os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE',
    'mysite_backend.settings'
)

from django.core.asgi import get_asgi_application

django_asgi_application = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from accounts.middleware import TokenAuthMiddleware
from accounts.routing import websocket_urlpatterns


application = ProtocolTypeRouter({
    "http": django_asgi_application,

    "websocket": TokenAuthMiddleware(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})