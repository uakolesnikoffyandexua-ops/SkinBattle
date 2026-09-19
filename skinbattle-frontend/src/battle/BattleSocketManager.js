export class BattleSocketManager {
  constructor({
    battleId,
    onOpen,
    onMessage,
    onError,
    onClose,
  }) {
    this.battleId = Number(battleId)

    this.onOpen = onOpen
    this.onMessage = onMessage
    this.onError = onError
    this.onClose = onClose

    this.socket = null

    this.reconnectTimer = null
    this.reconnectAttempts = 0

    this.heartbeatTimer = null
    this.pongTimeoutTimer = null

    this.shouldReconnect = true
  }

  get wsUrl() {
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return `ws://127.0.0.1:8000/ws/battles/${this.battleId}/`
    }

    return `wss://skinbattel.ru/ws/battles/${this.battleId}/`
  }

  connect() {
    if (!this.shouldReconnect) {
      return
    }

    if (
      this.socket &&
      (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return
    }

    console.log(
      `BATTLE MANAGER: connecting to Battle #${this.battleId}`
    )

    this.socket = new WebSocket(this.wsUrl)

    this.socket.onopen = () => {
      console.log(
        `BATTLE MANAGER: connected to Battle #${this.battleId}`
      )

      this.reconnectAttempts = 0

      this.startHeartbeat()

      if (this.onOpen) {
        this.onOpen()
      }
    }

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'pong') {
          console.log(
            `BATTLE MANAGER: pong received`
          )

          if (this.pongTimeoutTimer) {
            clearTimeout(this.pongTimeoutTimer)
            this.pongTimeoutTimer = null
          }

          return
        }
      } catch (error) {
        // Обычные сообщения Battle передаём дальше
      }

      if (this.onMessage) {
        this.onMessage(event)
      }
    }

    this.socket.onerror = (error) => {
      console.error(
        `BATTLE MANAGER: WebSocket error for Battle #${this.battleId}`,
        error
      )

      if (this.onError) {
        this.onError(error)
      }
    }

    this.socket.onclose = () => {
      console.log(
        `BATTLE MANAGER: disconnected from Battle #${this.battleId}`
      )

      this.stopHeartbeat()

      this.socket = null

      if (this.onClose) {
        this.onClose()
      }

      this.scheduleReconnect()
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (
        !this.socket ||
        this.socket.readyState !== WebSocket.OPEN
      ) {
        return
      }

      console.log(
        `BATTLE MANAGER: sending ping`
      )

      this.socket.send(
        JSON.stringify({
          type: 'ping',
        })
      )

      if (this.pongTimeoutTimer) {
        clearTimeout(this.pongTimeoutTimer)
      }

      this.pongTimeoutTimer = setTimeout(() => {
        console.warn(
          `BATTLE MANAGER: pong timeout, closing socket`
        )

        if (this.socket) {
          this.socket.close(
            4000,
            'Heartbeat timeout'
          )
        }
      }, 10000)
    }, 30000)

    console.log(
      `BATTLE MANAGER: heartbeat started`
    )
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer)
      this.pongTimeoutTimer = null
    }
  }

  scheduleReconnect() {
    if (!this.shouldReconnect) {
      return
    }

    if (this.reconnectTimer) {
      return
    }

    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      10000
    )

    this.reconnectAttempts += 1

    console.log(
      `BATTLE MANAGER: reconnecting in ${delay} ms`
    )

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  disconnect() {
    this.shouldReconnect = false

    this.stopHeartbeat()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    console.log(
      `BATTLE MANAGER: manually disconnected from Battle #${this.battleId}`
    )
  }

  send(data) {
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      this.socket.send(
        JSON.stringify(data)
      )

      return true
    }

    return false
  }

  get readyState() {
    if (!this.socket) {
      return WebSocket.CLOSED
    }

    return this.socket.readyState
  }
}