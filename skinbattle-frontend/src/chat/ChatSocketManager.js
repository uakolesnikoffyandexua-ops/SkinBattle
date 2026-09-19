export default class ChatSocketManager {
  constructor({
    url,
    token,
    onOpen,
    onMessage,
    onError,
    onClose,
  }) {
    this.url = url
    this.token = token

    this.onOpen = onOpen
    this.onMessage = onMessage
    this.onError = onError
    this.onClose = onClose

    this.socket = null
    this.reconnectTimer = null

    // Heartbeat
    this.heartbeatTimer = null
    this.pongTimeoutTimer = null
    this.heartbeatInterval = 30000
    this.pongTimeout = 10000

    this.manualDisconnect = false
    this.reconnectAttempts = 0

    this.maxReconnectDelay = 10000
  }

  connect() {
    this.manualDisconnect = false

    if (
      this.socket &&
      (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return
    }

    this.clearReconnectTimer()
    this.clearHeartbeat()

    const socketUrl =
      `${this.url}?token=${encodeURIComponent(this.token)}`

    console.log(
      'CHAT MANAGER: connecting...',
      socketUrl
    )

    const socket = new WebSocket(socketUrl)

    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) {
        return
      }

      console.log('CHAT MANAGER: connected')

      this.reconnectAttempts = 0

      this.startHeartbeat(socket)

      if (this.onOpen) {
        this.onOpen()
      }
    }

    socket.onmessage = (event) => {
      if (this.socket !== socket) {
        return
      }

      console.log(
        'CHAT MANAGER: message received:',
        event.data
      )

      // Обрабатываем pong от сервера
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'pong') {
          console.log(
            'CHAT MANAGER: pong received'
          )

          this.clearPongTimeout()

          return
        }
      } catch (error) {
        // Если это не JSON — передаём дальше
      }

      if (this.onMessage) {
        this.onMessage(event)
      }
    }

    socket.onerror = (error) => {
      if (this.socket !== socket) {
        return
      }

      console.error(
        'CHAT MANAGER: WebSocket error',
        error
      )

      if (this.onError) {
        this.onError(error)
      }
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return
      }

      this.clearHeartbeat()

      this.socket = null

      console.log(
        'CHAT MANAGER: disconnected',
        {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        }
      )

      if (this.onClose) {
        this.onClose(event)
      }

      if (!this.manualDisconnect) {
        this.scheduleReconnect()
      }
    }
  }

  startHeartbeat(socket) {
    this.clearHeartbeat()

    console.log(
      'CHAT MANAGER: heartbeat started'
    )

    this.heartbeatTimer = setInterval(() => {
      if (
        this.socket !== socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return
      }

      console.log(
        'CHAT MANAGER: sending ping'
      )

      socket.send(
        JSON.stringify({
          type: 'ping',
        })
      )

      this.clearPongTimeout()

      this.pongTimeoutTimer = setTimeout(() => {
        if (
          this.socket !== socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return
        }

        console.warn(
          'CHAT MANAGER: pong timeout, closing socket'
        )

        socket.close(
          4000,
          'Heartbeat timeout'
        )
      }, this.pongTimeout)
    }, this.heartbeatInterval)
  }

  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    this.clearPongTimeout()
  }

  clearPongTimeout() {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer)
      this.pongTimeoutTimer = null
    }
  }

  scheduleReconnect() {
    if (this.manualDisconnect) {
      return
    }

    if (this.reconnectTimer) {
      return
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    )

    this.reconnectAttempts += 1

    console.log(
      `CHAT MANAGER: reconnect in ${delay} ms`
    )

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null

      if (!this.manualDisconnect) {
        this.connect()
      }
    }, delay)
  }

  send(data) {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      console.warn(
        'CHAT MANAGER: cannot send, socket is not open'
      )

      return false
    }

    this.socket.send(
      typeof data === 'string'
        ? data
        : JSON.stringify(data)
    )

    return true
  }

  disconnect() {
    console.log(
      'CHAT MANAGER: manual disconnect'
    )

    this.manualDisconnect = true

    this.clearReconnectTimer()
    this.clearHeartbeat()

    if (this.socket) {
      const socket = this.socket

      this.socket = null

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, 'Client disconnect')
      }
    }

    this.reconnectAttempts = 0
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  get readyState() {
    if (!this.socket) {
      return WebSocket.CLOSED
    }

    return this.socket.readyState
  }
}