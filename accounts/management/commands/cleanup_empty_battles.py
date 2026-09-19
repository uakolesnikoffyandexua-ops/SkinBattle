from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Battle
from accounts.services import log_action


class Command(BaseCommand):
    help = 'Удаляет пустые Battle, которые ждут более 2 минут'

    def handle(self, *args, **options):
        cutoff_time = timezone.now() - timedelta(minutes=2)

        empty_battles = (
            Battle.objects
            .filter(
                status='waiting',
                created_at__lte=cutoff_time,
                bets__isnull=True,
            )
            .distinct()
        )

        battles = list(empty_battles)

        if not battles:
            self.stdout.write(
                self.style.SUCCESS(
                    'Пустых просроченных Battle не найдено.'
                )
            )
            return

        deleted_ids = []

        for battle in battles:
            battle_id = battle.id

            log_action(
                user=None,
                action='battle_cancelled',
                description=(
                    f'Battle #{battle_id} automatically deleted '
                    f'because it remained empty for more than 2 minutes'
                ),
                metadata={
                    'battle_id': battle_id,
                    'created_by_user_id': (
                        battle.created_by_id
                        if battle.created_by_id
                        else None
                    ),
                    'reason': 'empty_timeout',
                    'timeout_minutes': 2,
                },
            )

            battle.delete()
            deleted_ids.append(battle_id)

        self.stdout.write(
            self.style.SUCCESS(
                f'Удалено пустых Battle: {len(deleted_ids)}. '
                f'ID: {deleted_ids}'
            )
        )