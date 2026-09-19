import { useEffect, useRef } from 'react'

function BattleRoll({
  rollItems,
  isActive,
  winner,
}) {
  const windowRef = useRef(null)
  const trackRef = useRef(null)

  const animationFrameRef = useRef(null)
  const offsetRef = useRef(0)
  const phaseRef = useRef('idle')
  const winnerRef = useRef(null)
  const finishingRef = useRef(false)

  useEffect(() => {
    winnerRef.current = winner
  }, [winner])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const track = trackRef.current
    const windowElement = windowRef.current

    if (!track || !windowElement) {
      return
    }

    phaseRef.current = 'rolling'
    finishingRef.current = false
    offsetRef.current = 0

    const spinSpeed = 1400
    let lastTime = performance.now()

    const animate = (now) => {
      const delta = (now - lastTime) / 1000
      lastTime = now

      /*
       * Пока сервер не дал победителя,
       * просто непрерывно движемся влево.
       */
      if (
        phaseRef.current === 'rolling' &&
        winnerRef.current
      ) {
        startFinishAnimation()
        return
      }

      if (phaseRef.current === 'rolling') {
        offsetRef.current -= spinSpeed * delta

        track.style.transform =
          `translateX(${offsetRef.current}px)`
      }

      animationFrameRef.current =
        requestAnimationFrame(animate)
    }

    /*
     * Когда Winner пришёл,
     * ищем конкретную его карточку,
     * которая находится впереди текущей позиции.
     */
    const startFinishAnimation = () => {
      if (finishingRef.current) {
        return
      }

      finishingRef.current = true
      phaseRef.current = 'finishing'

      const currentOffset =
        offsetRef.current

      const windowRect =
        windowElement.getBoundingClientRect()

      const pointerX =
        windowRect.left +
        windowRect.width / 2

      const candidates = []

      Array.from(track.children).forEach(
        (element, index) => {
          const username =
            element.dataset.username

          if (
            username !== winnerRef.current
          ) {
            return
          }

          const rect =
            element.getBoundingClientRect()

          const centerX =
            rect.left +
            rect.width / 2

          const delta =
            pointerX - centerX

          const targetOffset =
            currentOffset + delta

          /*
           * Лента движется влево.
           * Поэтому финальная точка должна
           * находиться левее текущей.
           */
          if (
            targetOffset <
            currentOffset - 500
          ) {
            candidates.push({
              index,
              targetOffset,
            })
          }
        }
      )

      if (candidates.length === 0) {
        console.error(
          'BattleRoll: winner target not found'
        )

        phaseRef.current = 'idle'
        return
      }

      /*
       * Берём ближайшую подходящую
       * карточку Winner.
       */
      candidates.sort(
        (a, b) =>
          Math.abs(
            a.targetOffset -
              (currentOffset - 1800)
          ) -
          Math.abs(
            b.targetOffset -
              (currentOffset - 1800)
          )
      )

      const target =
        candidates[0].targetOffset

const start = 
  offsetRef.current

const distance =
  target - start

/*
 * Сохраняем примерно ту же скорость,
 * с которой рулетка двигалась до Winner.
 *
 * При easeOutQuad начальная скорость:
 * 2 * distance / duration
 */
const currentSpeed = spinSpeed

const duration =
  Math.max(
    4500,
    Math.min(
      6500,
      (5 * Math.abs(distance)) /
        currentSpeed *
        1000
    )
  )

const startTime =
  performance.now()

const finish = (time) => {
  const progress =
    Math.min(
      1,
      (time - startTime) /
        duration
    )

  /*
   * easeOutQuad:
   * в начале движемся быстро,
   * затем плавно замедляемся
   * и в конце полностью останавливаемся.
   */
  const eased =
    1 -
    Math.pow(
      1 - progress,
      3
    )

  offsetRef.current =
    start +
    distance * eased

  track.style.transform =
    `translateX(${offsetRef.current}px)`

  if (progress < 1) {
    animationFrameRef.current =
      requestAnimationFrame(finish)

    return
  }

  offsetRef.current = target

  track.style.transform =
    `translateX(${target}px)`

  phaseRef.current = 'finished'

  console.log(
    'BattleRoll finished:',
    winnerRef.current,
    target
  )
}

      cancelAnimationFrame(
        animationFrameRef.current
      )

      animationFrameRef.current =
        requestAnimationFrame(finish)
    }

    animationFrameRef.current =
      requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(
        animationFrameRef.current
      )
    }
  }, [isActive])

  return (
    <div
      className="arena-window"
      ref={windowRef}
    >
      <div className="arena-pointer"></div>

      <div
        className="arena-track"
        ref={trackRef}
      >
        {rollItems.map(
          (user, index) => (
            <div
              className="arena-player"
              data-username={user.username}
              key={`${user.username}-${index}`}
            >
              <div className="arena-avatar">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                  />
                ) : (
                  <span>👤</span>
                )}
              </div>

              <span>
                {user.username}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default BattleRoll