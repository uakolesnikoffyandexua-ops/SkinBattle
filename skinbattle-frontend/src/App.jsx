import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import axios from 'axios'
import BattleRoll from './BattleRoll'
import { getToken, setToken } from './api'
import ChatSocketManager from './chat/ChatSocketManager'
import { BattleSocketManager } from './battle/BattleSocketManager'
import './App.css'
import AdminPanel from './AdminPanelPag'
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'

 
function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { battleId } = useParams()
   useEffect(() => {

    setAdminPage(false)

    if (location.pathname === '/shop') {
      setShopPage(true)
      setProfilePage(false)
      setBattlePage(null)
      return
    }

    if (location.pathname === '/profile') {
      setShopPage(false)
      setProfilePage(true)
      setBattlePage(null)
      return
    }

    const battleMatch = location.pathname.match(
      /^\/battle\/(\d+)$/
    )

    if (battleMatch) {
      const id = battleMatch[1]

      setShopPage(false)
      setProfilePage(false)

      const token = getToken()

      axios
        .get(`/api/battles/${id}/`, {
          headers: {
            Authorization: `Token ${token}`,
          },
        })
        .then((response) => {
          console.log(
            `Battle #${id} loaded from URL:`,
            response.data
          )

          setBattlePage(
            normalizeBattle(response.data)
          )
        })
        .catch((error) => {
          console.error(
            `Battle #${id} load error:`,
            error
          )

          setBattlePage(null)
          navigate('/')
        })

      return
    }

    if (location.pathname === '/') {
      setShopPage(false)
      setProfilePage(false)
      setBattlePage(null)
    }
  }, [location.pathname])
  const API_BASE = window.location.origin;
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatOpen, setChatOpen] = useState(true)

  const chatSocketRef = useRef(null)
  const [selectedBattle, setSelectedBattle] = useState(null)
  const [betAmount, setBetAmount] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [creatingBattle, setCreatingBattle] = useState(false)
  const [createBattleCooldown, setCreateBattleCooldown] = useState(0)
  const [battlePage, setBattlePage] = useState(null)
  const [shopPage, setShopPage] = useState(false)
  const [profilePage, setProfilePage] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileTradeUrl, setProfileTradeUrl] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [apiBattles, setApiBattles] = useState([])
  const [winnerUsername, setWinnerUsername] = useState(null)
  const [winnerIndex, setWinnerIndex] = useState(null)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [rollOffset, setRollOffset] = useState(0)

  const arenaWindowRef = useRef(null)
  const arenaTrackRef = useRef(null)

  

  const rollingBattleIdRef = useRef(null)
  const finishedBattleIdsRef = useRef(new Set())
  const finishTimerRef = useRef(null)

  const [me, setMe] = useState(null)
  const [adminPage, setAdminPage] = useState(false)
  const [inventory, setInventory] = useState([])
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null)

  const [shopOffers, setShopOffers] = useState([])
  const [shopSearch, setShopSearch] = useState('')
  const [shopSearchInput, setShopSearchInput] = useState('')
  const [shopMinPrice, setShopMinPrice] = useState('')
  const [shopMaxPrice, setShopMaxPrice] = useState('')
  const [shopResultsPage, setShopResultsPage] = useState(1)
  const [shopHasMore, setShopHasMore] = useState(false)
  const [shopLoading, setShopLoading] = useState(false)
  const [buyingOfferId, setBuyingOfferId] = useState(null)
  const loginWithSteam = () => {
  window.location.href = '/api/auth/steam/'
  }

  const openProfile = async () => {
  navigate('/profile')

  const token = getToken()

  if (!token) {
    alert('Вы не авторизованы')
    return
  }


    try {
      const response = await axios.get(
        '/api/profile/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      setProfile(response.data)
      setProfileTradeUrl(response.data.trade_url || '')
    } catch (error) {
      console.error('PROFILE API ERROR:', error)
      alert(
        error.response?.data?.detail ||
        'Не удалось загрузить профиль'
      )
      setProfilePage(false)
    }
  }

  const logout = () => {
  localStorage.removeItem('token')

  setToken('')
  setMe(null)
  setProfile(null)
  setProfileTradeUrl('')
  setProfilePage(false)
  setBattlePage(null)
  setShopPage(false)

  window.location.reload()
  }

  const saveProfile = async () => {
    const token = getToken()

    if (!token) {
      alert('Вы не авторизованы')
      return
    }

    setProfileSaving(true)

    try {
      const response = await axios.patch(
        '/api/profile/',
        {
          trade_url: profileTradeUrl.trim(),
        },
        {
          headers: {
            Authorization: `Token ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      setProfile(response.data)
      setProfileTradeUrl(response.data.trade_url || '')

      // Обновляем базовые данные пользователя в шапке.
      const meResponse = await axios.get(
        '/api/me/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      setMe(meResponse.data)

      alert('Профиль сохранён')
    } catch (error) {
      console.error('PROFILE SAVE ERROR:', error)

      const validationError =
        error.response?.data?.trade_url?.[0]

      alert(
        validationError ||
        error.response?.data?.detail ||
        'Не удалось сохранить профиль'
      )
    } finally {
      setProfileSaving(false)
    }
  }

  const normalizeBattle = (battle) => {
  const bets = battle.bets || []

  return {
    ...battle,

    bank: Number(battle.total_bank || 0),

    players: bets.length,

    maxPlayers: Number(battle.max_players || 10),

    users: bets.map((bet) => ({
      username: bet.username,
      avatar: bet.avatar_url || 'https://i.pravatar.cc/100?img=12',
      amount: Number(bet.amount || 0),
    })),
  }
}

const sellAllInventory = async () => {
  const availableItems = inventory.filter(
    (item) => item.status === 'available'
  )

  if (availableItems.length === 0) {
    alert('Нет доступных скинов для продажи')
    return
  }

  const total = availableItems.reduce(
    (sum, item) =>
      sum + Number(item.skinbattle_price || 0),
    0
  )

  const confirmed = window.confirm(
    `Продать все доступные скины?\n\n` +
    `Скинов: ${availableItems.length}\n` +
    `Сумма: ${total.toFixed(2)} SB`
  )

  if (!confirmed) {
    return
  }

  try {
    const token = getToken()

    if (!token) {
      alert('Вы не авторизованы')
      return
    }

    const response = await axios.post(
      '/api/inventory/sell-all/',
      {},
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    console.log(
      'SELL ALL RESULT:',
      response.data
    )

    // Обновляем баланс
    const meResponse = await axios.get(
      '/api/me/',
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    setMe(meResponse.data)

    // Обновляем Inventory
    const inventoryResponse = await axios.get(
      '/api/inventory/',
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    setInventory(inventoryResponse.data)

    alert(
      `Продано скинов: ${response.data.sold_count}\n` +
      `Получено: ${response.data.amount} SB`
    )

  } catch (error) {

    console.error(
      'SELL ALL ERROR:',
      error
    )

    alert(
      error.response?.data?.error ||
      'Не удалось продать скины'
    )
  }
}


  const buildRollItems = (
    users,
    totalSlots = 300,
    battleId = 0
  ) => {
    if (!users || users.length === 0) {
      return []
    }

    const normalizedUsers = users.map((user) => ({
      ...user,
      amount: Number(user.amount || 0),
    }))

    const totalAmount = normalizedUsers.reduce(
      (sum, user) => sum + user.amount,
      0
    )

    if (totalAmount <= 0) {
      return []
    }

    const counts = normalizedUsers.map((user) => {
      const exactCount =
        (user.amount / totalAmount) * totalSlots

      return {
        user,
        count: Math.floor(exactCount),
        remainder:
          exactCount - Math.floor(exactCount),
      }
    })

    // Если доля игрока очень маленькая, оставляем
    // ему хотя бы одну позицию.
    if (totalSlots >= normalizedUsers.length) {
      counts.forEach((item) => {
        if (item.count === 0) {
          item.count = 1
        }
      })
    }

    let usedSlots = counts.reduce(
      (sum, item) => sum + item.count,
      0
    )

    // Раздаём оставшиеся позиции по наибольшим
    // дробным остаткам.
    if (usedSlots < totalSlots) {
      const sorted = [...counts].sort(
        (a, b) => b.remainder - a.remainder
      )

      let index = 0

      while (usedSlots < totalSlots) {
        sorted[index % sorted.length].count += 1
        usedSlots += 1
        index += 1
      }
    }

    // Если из-за минимальных единиц получилось больше,
    // убираем позиции у крупнейших участников.
    if (usedSlots > totalSlots) {
      const sorted = [...counts]
        .filter((item) => item.count > 1)
        .sort((a, b) => b.count - a.count)

      let index = 0

      while (
        usedSlots > totalSlots &&
        sorted.length > 0
      ) {
        const item = sorted[index % sorted.length]

        if (item.count > 1) {
          item.count -= 1
          usedSlots -= 1
        }

        index += 1
      }
    }

    const items = []

    counts.forEach((item) => {
      for (let i = 0; i < item.count; i += 1) {
        items.push(item.user)
      }
    })

    // Детерминированный pseudo-random generator.
    // Благодаря этому все клиенты одной Battle строят
    // одинаковую последовательность рулетки.
    let seed = (
      Number(battleId || 0) * 2654435761
    ) >>> 0

    const random = () => {
      seed += 0x6D2B79F5

      let t = seed

      t = Math.imul(
        t ^ (t >>> 15),
        t | 1
      )

      t ^= t + Math.imul(
        t ^ (t >>> 7),
        t | 61
      )

      return (
        ((t ^ (t >>> 14)) >>> 0) /
        4294967296
      )
    }

    // Fisher-Yates shuffle.
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(
        random() * (i + 1)
      )

      ;[items[i], items[j]] = [
        items[j],
        items[i],
      ]
    }

    return items
  }
  
  useEffect(() => {
  const hash = window.location.hash

  if (hash.startsWith('#token=')) {
    const token = hash.substring(7)

    setToken(token)

    window.history.replaceState(
      null,
      '',
      window.location.pathname
    )
  }
  }, [])

  useEffect(() => {
    const token = getToken()

    axios
      .get('/api/battles/', {
        headers: {
          Authorization: `Token ${token}`,
        },
      })
      .then((response) => {
        setApiBattles(
          response.data.map(normalizeBattle)
        )
      })
      .catch((error) => {
        console.error('API error:', error)
      })
  }, [])

const filteredShopOffers = shopOffers

useEffect(() => {
  const query = shopSearch.trim()

  const controller = new AbortController()

  const timer = setTimeout(async () => {
    const token = getToken()

    setShopLoading(true)
    setShopResultsPage(1)
    setShopHasMore(false)

    const params = new URLSearchParams()

    params.set('q', query)
    params.set('page', '1')

    if (shopMinPrice !== '') {
      params.set('min_price', shopMinPrice)
    }

    if (shopMaxPrice !== '') {
      params.set('max_price', shopMaxPrice)
    }

    try {
      const response = await axios.get(
        `/api/shop/search/?${params.toString()}`,
        {
          headers: {
            Authorization: `Token ${token}`,
          },
          signal: controller.signal,
        }
      )

      console.log(
        'TM MARKET SEARCH:',
        response.data
      )

      setShopOffers(
        response.data.results || []
      )

      setShopResultsPage(
        response.data.page || 1
      )

      setShopHasMore(
        response.data.has_more || false
      )
    } catch (error) {
      if (
        error?.name === 'CanceledError' ||
        error?.code === 'ERR_CANCELED'
      ) {
        console.log(
          'SHOP SEARCH: previous request cancelled'
        )
        return
      }

      console.error(
        'TM MARKET SEARCH ERROR:',
        error
      )

      setShopOffers([])
      setShopResultsPage(1)
      setShopHasMore(false)
    } finally {
      if (!controller.signal.aborted) {
        setShopLoading(false)
      }
    }
  }, 300)

  return () => {
    clearTimeout(timer)
    controller.abort()
  }
}, [
  shopSearch,
  shopMinPrice,
  shopMaxPrice,
])

const loadMoreShopOffers = async () => {
  if (shopLoading || !shopHasMore) {
    return
  }

  const query = shopSearch.trim()
  const nextPage = shopResultsPage + 1
  const token =
    getToken()

  const params = new URLSearchParams()

  params.set('q', query)
  params.set('page', String(nextPage))

  if (shopMinPrice !== '') {
    params.set('min_price', shopMinPrice)
  }

  if (shopMaxPrice !== '') {
    params.set('max_price', shopMaxPrice)
  }

  setShopLoading(true)

  try {
    const response = await axios.get(
      `/api/shop/search/?${params.toString()}`,
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    console.log(
      'TM MARKET SEARCH MORE:',
      response.data
    )

    const newResults = response.data.results || []

    setShopOffers((previousOffers) => [
      ...previousOffers,
      ...newResults,
    ])

    setShopResultsPage(
      response.data.page || nextPage
    )

    setShopHasMore(
      response.data.has_more || false
    )
  } catch (error) {
    console.error(
      'TM MARKET SEARCH MORE ERROR:',
      error
    )
  } finally {
    setShopLoading(false)
  }
}

const buyShopOffer = async (offer) => {
  if (!offer?.offer_id) {
    alert('Не найден ID предложения')
    return
  }

  if (buyingOfferId) {
    return
  }

  const confirmed = window.confirm(
    `Купить ${offer.market_hash_name} за ${Number(
      offer.skinbattle_price
    ).toFixed(2)} SB?`
  )

  if (!confirmed) {
    return
  }

  const token =
    getToken()

  setBuyingOfferId(offer.offer_id)

  try {
    const response = await axios.post(
      `/api/shop/offers/${offer.offer_id}/buy/`,
      {},
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    console.log(
      'BUY SHOP OFFER response:',
      response.data
    )

    // Обновляем баланс пользователя
    const meResponse = await axios.get(
      '/api/me/',
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    setMe(meResponse.data)

    // Обновляем Inventory
    const inventoryResponse = await axios.get(
      '/api/inventory/',
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    setInventory(inventoryResponse.data)

    // Убираем купленный товар из Shop
    setShopOffers((previousOffers) =>
      previousOffers.filter(
        (item) => item.offer_id !== offer.offer_id
      )
    )

    alert(
      `Покупка успешна!\n${offer.market_hash_name}\nЦена: ${Number(
        response.data.price
      ).toFixed(2)} SB`
    )

  } catch (error) {
    console.error(
      'BUY SHOP OFFER ERROR:',
      error
    )

    if (error.response?.data?.error) {
      alert(error.response.data.error)
    } else {
      alert('Не удалось купить предмет')
    }

  } finally {
    setBuyingOfferId(null)
  }
}

  useEffect(() => {
  const socket = new WebSocket(
    'wss://skinbattel.ru/ws/lobby/'
  )

  socket.onopen = () => {
    console.log('Lobby WebSocket connected')
  }

  socket.onmessage = async (event) => {
    console.log(
      'Lobby WebSocket message:',
      event.data
    )

    try {
      const data = JSON.parse(event.data)

      if (
        data.event === 'PLAYER_JOINED' ||
        data.event === 'PLAYER_LEFT' ||
        data.event === 'BATTLE_STARTED' ||
        data.event === 'BATTLE_FINISHED'
      ) {
        const token =
          getToken()

        const response = await axios.get(
          '/api/battles/',
          {
            headers: {
              Authorization: `Token ${token}`,
            },
          }
        )

        setApiBattles(
          response.data.map(normalizeBattle)
        )
      }
    } catch (error) {
      console.error(
        'Lobby WebSocket message error:',
        error
      )
    }
  }

  socket.onerror = (error) => {
    console.error(
      'Lobby WebSocket error:',
      error
    )
  }

  socket.onclose = () => {
    console.log(
      'Lobby WebSocket disconnected'
    )
  }

  return () => {
    socket.close()
  }
}, [])

  useEffect(() => {
  axios
    .get('/api/me/', {
      headers: {
       Authorization: `Token ${getToken()}`,
      },
    })
    .then((response) => {
  console.log('ME API response:', response.data)
  setMe(response.data)
})
    .catch((error) => {
      console.error('ME API error:', error)
    })
}, [])

useEffect(() => {
    const token = getToken()

    axios
      .get('/api/inventory/', {
        headers: {
          Authorization: `Token ${token}`,
        },
      })
      .then((response) => {
        console.log('INVENTORY API response:', response.data)
        setInventory(response.data)
      })
      .catch((error) => {
        console.error('INVENTORY API error:', error)
      })
  }, [])

  const rollItems = useMemo(
    () =>
      buildRollItems(
        battlePage?.users || [],
        300,
        battlePage?.id || 0
      ),
    [battlePage?.id, battlePage?.users]
  )

  const leaveCurrentBattle = async () => {
    if (!battlePage?.id) {
      return
    }

    const confirmed = window.confirm(
      'Выйти из Battle? Ваша ставка будет полностью возвращена на баланс.'
    )

    if (!confirmed) {
      return
    }

    const token = getToken()

    try {
      const response = await axios.post(
        `/api/battles/${battlePage.id}/leave/`,
        {},
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      console.log('Leave Battle response:', response.data)

      const meResponse = await axios.get(
        '/api/me/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      setMe(meResponse.data)

      const battlesResponse = await axios.get(
        '/api/battles/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      setApiBattles(
        battlesResponse.data.map(normalizeBattle)
      )

      setWinnerUsername(null)
      setWinnerIndex(null)
      setIsFinalizing(false)
      setIsRolling(false)
      setRollOffset(0)
      setBattlePage(null)

      alert(
        `Ставка ${Number(response.data.refund_amount).toFixed(2)} ₽ возвращена на баланс`
      )
    } catch (error) {
      console.error('Leave Battle error:', error)

      if (error.response?.data?.error) {
        alert(error.response.data.error)
      } else {
        alert('Не удалось выйти из Battle')
      }
    }
  }

const startVisualRoll = (battleId) => {
const numericBattleId = Number(battleId)

console.log(
  'startVisualRoll:',
  numericBattleId,
  'previous:',
  rollingBattleIdRef.current
)

if (rollingBattleIdRef.current === numericBattleId) {
  console.log(
    'startVisualRoll skipped for Battle:',
    numericBattleId
  )
  return
}

rollingBattleIdRef.current = numericBattleId
    finishedBattleIdsRef.current.delete(
      numericBattleId
    )

    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current)
      finishTimerRef.current = null
    }

    setWinnerUsername(null)
    setWinnerIndex(null)
    setIsFinalizing(false)
    setRollOffset(0)
    setIsRolling(true)

setRollOffset(0)
setIsRolling(true)

console.log(
  'ROLL DOM:',
  arenaTrackRef.current
)

console.log('ROLL: set position 0')

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    console.log('ROLL: set position -12000')
    setRollOffset(-12000)
  })
})
  }

  useEffect(() => {
  if (!battlePage?.id) {
    return
  }

  if (battlePage.status !== 'active') {
    return
  }

  if (rollingBattleIdRef.current === battlePage.id) {
    return
  }

  const battleId = Number(battlePage.id)

  console.log(
    `Battle #${battleId} already active. Starting visual roll automatically.`
  )

  startVisualRoll(battleId)

  const timer = setTimeout(async () => {
    const token = getToken()

    try {
      const response = await axios.post(
        `/api/battles/${battleId}/process/`,
        {},
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      console.log(
        'Automatic process response:',
        response.data
      )

      if (response.data?.winner) {
        await finishVisualBattle({
          event: 'BATTLE_FINISHED',
          battle_id: battleId,
          winner: response.data.winner,
          total_bank: response.data.total_bank,
          commission: response.data.commission,
          prize: response.data.prize,
        })
      }
    } catch (error) {
      console.error(
        'Automatic Battle process error:',
        error
      )
    }
  }, 7000)

  return () => {
    clearTimeout(timer)
  }
}, [battlePage?.id, battlePage?.status])

 const finishVisualBattle = async (data) => {
  const battleId = Number(data.battle_id)

  if (
    finishedBattleIdsRef.current.has(
      battleId
    )
  ) {
    return
  }

  finishedBattleIdsRef.current.add(
    battleId
  )

  const winner = data.winner

  if (!winner) {
    console.error(
      'BATTLE_FINISHED received without winner:',
      data
    )

    setIsRolling(false)
    setIsFinalizing(false)
    rollingBattleIdRef.current = null

    return
  }

  console.log(
    `Battle #${battleId} finished:`,
    data
  )

  setWinnerUsername(winner)

  setWinnerUsername(winner)

console.log(
  `Battle #${battleId} finished. Winner:`,
  winner
)

  finishTimerRef.current = setTimeout(
    async () => {
      setIsFinalizing(false)
      setIsRolling(false)
      rollingBattleIdRef.current = null
      finishTimerRef.current = null

      const token =
        getToken()

      try {
        const meResponse =
          await axios.get(
            '/api/me/',
            {
              headers: {
                Authorization:
                  `Token ${token}`,
              },
            }
          )

        setMe(meResponse.data)

        const battlesResponse =
          await axios.get(
            '/api/battles/',
            {
              headers: {
                Authorization:
                  `Token ${token}`,
              },
            }
          )

        setApiBattles(
          battlesResponse.data.map(
            normalizeBattle
          )
        )

        setBattlePage(null)

        alert(
          `Победитель: ${winner}`
        )

      } catch (error) {
        console.error(
          'Post-finish update error:',
          error
        )

        setBattlePage(null)

        alert(
          `Победитель: ${winner}`
        )
      }
    },
    7000
  )
}
  useEffect(() => {
  if (!battlePage?.id) {
    return
  }

  const battleId = Number(battlePage.id)

  const battleSocket = new BattleSocketManager({
    battleId,

    onOpen: () => {
      console.log(
        `WebSocket connected to Battle #${battleId}`
      )
    },

    onMessage: async (event) => {
      console.log(
        `Battle #${battleId} WebSocket message:`,
        event.data
      )

      try {
        const data = JSON.parse(
          event.data
        )

        if (
          data.event === 'CONNECTED'
        ) {
          return
        }

        if (
          Number(data.battle_id) !==
          battleId
        ) {
          return
        }

        if (
          data.event === 'BATTLE_STARTED'
        ) {
          console.log(
            `Battle #${battleId} started via WebSocket`
          )

          setBattlePage((prev) => {
            if (!prev) {
              return prev
            }

            return {
              ...prev,
              status: 'active',
            }
          })

          startVisualRoll(battleId)

          return
        }

        if (
          data.event === 'PLAYER_JOINED'
        ) {
          const token =
            getToken()

          const battleResponse =
            await axios.get(
              `/api/battles/${battleId}/`,
              {
                headers: {
                  Authorization:
                    `Token ${token}`,
                },
              }
            )

          setBattlePage(
            normalizeBattle(
              battleResponse.data
            )
          )

          console.log(
            'Battle updated via WebSocket:',
            battleResponse.data
          )

          return
        }

        if (
          data.event === 'PLAYER_LEFT'
        ) {
          const token =
            getToken()

          const battleResponse =
            await axios.get(
              `/api/battles/${battleId}/`,
              {
                headers: {
                  Authorization:
                    `Token ${token}`,
                },
              }
            )

          setBattlePage(
            normalizeBattle(
              battleResponse.data
            )
          )

          console.log(
            'Battle updated after PLAYER_LEFT:',
            battleResponse.data
          )

          return
        }

        if (
          data.event === 'BATTLE_FINISHED'
        ) {
          await finishVisualBattle(data)

          return
        }

      } catch (error) {
        console.error(
          'WebSocket message error:',
          error
        )
      }
    },

    onError: (error) => {
      console.error(
        `Battle #${battleId} WebSocket error:`,
        error
      )
    },

    onClose: () => {
      console.log(
        `WebSocket disconnected from Battle #${battleId}`
      )
    },
  })

  battleSocket.connect()

  return () => {
    battleSocket.disconnect()
  }
}, [battlePage?.id])
  
  useEffect(() => {
  if (createBattleCooldown <= 0) {
    return
  }

  const timer = setInterval(() => {
    setCreateBattleCooldown((previous) => {
      if (previous <= 1) {
        clearInterval(timer)
        return 0
      }

      return previous - 1
    })
  }, 1000)

  return () => clearInterval(timer)
  }, [createBattleCooldown])

  useEffect(() => {
  const token = getToken()

  console.log('CHAT: useEffect started')

  if (!token) {
    console.warn(
      'CHAT: no token, WebSocket not created'
    )
    return
  }

  console.log('CHAT: token exists')

  const wsBase =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? 'ws://127.0.0.1:8000/ws/chat/'
      : 'wss://skinbattel.ru/ws/chat/'

  const manager = new ChatSocketManager({
    url: wsBase,
    token,

    onOpen: () => {
      console.log(
        'CHAT: WebSocket connected'
      )

      console.log(
        'CHAT: readyState =',
        manager.readyState
      )
    },

    onMessage: (event) => {
      console.log(
        'CHAT: message received:',
        event.data
      )

      try {
        const data = JSON.parse(
          event.data
        )

        console.log(
          'CHAT: parsed message:',
          data
        )

        if (
  data.event === 'CHAT_MESSAGE'
) {
  setChatMessages((prev) => {
    const alreadyExists = prev.some(
      (item) => item.id === data.id
    )

    if (alreadyExists) {
      console.log(
        'CHAT: duplicate message ignored:',
        data.id
      )

      return prev
    }

    return [
      ...prev,
      {
        id: data.id,
        user_id: data.user_id,
        username: data.username,
        avatar_url: data.avatar_url,
        message: data.message,
        created_at: data.created_at,
      },
    ]
  })
}
      } catch (error) {
        console.error(
          'CHAT: invalid message',
          error
        )
      }
    },

    onError: (error) => {
      console.error(
        'CHAT: WebSocket error',
        error
      )

      console.log(
        'CHAT: readyState after error =',
        manager.readyState
      )
    },

    onClose: (event) => {
      console.log(
        'CHAT: WebSocket disconnected'
      )

      console.log(
        'CHAT: close code =',
        event.code
      )

      console.log(
        'CHAT: close reason =',
        event.reason
      )

      console.log(
        'CHAT: wasClean =',
        event.wasClean
      )

      console.log(
        'CHAT: readyState =',
        manager.readyState
      )
    },
  })

  chatSocketRef.current = manager

  manager.connect()

  return () => {
    console.log(
      'CHAT: cleanup, disconnecting manager'
    )

    manager.disconnect()

    if (
      chatSocketRef.current === manager
    ) {
      chatSocketRef.current = null
    }
  }
}, [])

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(
          finishTimerRef.current
        )
      }
    }
  }, [])

  if (location.pathname.startsWith('/admin')) {
  return (
    <AdminPanel
      token={getToken()}
      onClose={() => navigate('/')}
    />
  )
}

  if (profilePage) {
    return (
      <div className="app">
        <header className="header">
          <div className="logo">
            SKIN<span>BATTLE</span>
          </div>

          <nav className="navigation">
            <button
              className="nav-button"
              onClick={() => {
                navigate('/')
              }}
            >
              Battles
            </button>

            <button
              className="nav-button"
              onClick={() => {
  navigate('/shop')
}}
            >
              Shop
            </button>

            <button className="nav-button">
              Upgrade
            </button>

            <button className="nav-button">
              Coin Flip
            </button>
          </nav>

          <div className="header-right">
            {!me && (
              <button
  className="steam-login"
  onClick={loginWithSteam}
>
  <span className="steam-icon">◉</span>
  <span>Войти через Steam</span>
</button>
            )}

            <button className="balance">
              ₽ {me ? Number(me.balance).toFixed(2) : '0.00'}
            </button>

            <button className="language">RU</button>

            <button
              className="profile"
              onClick={openProfile}
              title="Profile"
            >
              {me?.avatar_url ? (
                <img
                  src={me.avatar_url}
                  alt={me.username || 'Steam'}
                />
              ) : (
                <span>👤</span>
              )}
            </button>
          </div>
        </header>

        <main className="main-content">
          <div className="page-title">
            <div>
              <h1>Profile</h1>
              <p>Manage your account and Steam Trade URL</p>
            </div>
          </div>

          <div
            style={{
              maxWidth: '900px',
              margin: '0 auto',
              display: 'grid',
              gap: '20px',
            }}
          >
            <section
              style={{
                background: '#15161d',
                border: '1px solid #292b36',
                borderRadius: '16px',
                padding: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                  marginBottom: '28px',
                }}
              >
                <div
                  style={{
                    width: '76px',
                    height: '76px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: '#292b36',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                  }}
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username || 'Avatar'}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    '👤'
                  )}
                </div>

                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '24px',
                    }}
                  >
                    {profile?.username || me?.username || 'User'}
                  </h2>

                  <div
                    style={{
                      marginTop: '6px',
                      color: profile?.steam_id
                        ? '#6cff9a'
                        : '#888',
                      fontSize: '14px',
                    }}
                  >
                    {profile?.steam_id
                      ? '✓ Steam connected'
                      : 'Steam not connected'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <label
                  style={{
                    fontSize: '14px',
                    fontWeight: '700',
                  }}
                >
                  Steam Trade URL
                </label>

                <input
                  type="text"
                  value={profileTradeUrl}
                  onChange={(event) =>
                    setProfileTradeUrl(event.target.value)
                  }
                  placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #3a3d4a',
                    background: '#0f1015',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '14px',
                  }}
                />

                <p
  style={{
    margin: '0',
    color: '#777b89',
    fontSize: '13px',
    lineHeight: '1.5',
  }}
>
  Укажи свой Steam Trade URL. Он понадобится для
  будущего вывода выигранных скинов.{' '}
  <a
    href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      color: '#24854f',
      fontWeight: '600',
      textDecoration: 'none',
    }}
  >
    Найти её можешь тут
  </a>
</p>

                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={profileSaving}
                  style={{
                    marginTop: '8px',
                    padding: '13px 20px',
                    border: 'none',
                    borderRadius: '10px',
                    background: profileSaving
                      ? '#555'
                      : '#8b5cf6',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: profileSaving
                      ? 'not-allowed'
                      : 'pointer',
                  }}
                >
                  {profileSaving
                    ? 'Saving...'
                    : 'Save Trade URL'}
                </button>
                {me?.is_staff && (
  <button
    type="button"
    onClick={() => navigate('/admin')}
    style={{
      width: '100%',
      marginTop: '12px',
      padding: '13px 16px',
      borderRadius: '10px',
      border: '1px solid rgba(139, 92, 246, 0.45)',
      background: 'rgba(139, 92, 246, 0.10)',
      color: '#a78bfa',
      fontSize: '14px',
      fontWeight: '700',
      cursor: 'pointer',
      transition: '0.2s',
    }}
  >
    🛡 Admin Panel
  </button>
)}

<button
  type="button"
  onClick={logout}
  style={{
    width: '100%',
    marginTop: '12px',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #3a3d48',
    background: 'transparent',
    color: '#ff5c70',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  }}
>
  Выйти из Аккаунта
</button>
              </div>
            </section>

            <section
              style={{
                background: '#15161d',
                border: '1px solid #292b36',
                borderRadius: '16px',
                padding: '24px',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Account</h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '14px',
                }}
              >
                <div>
                  <span style={{ color: '#777b89', fontSize: '13px' }}>
                    Balance
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: '6px',
                      fontSize: '20px',
                    }}
                  >
                    ₽ {me ? Number(me.balance).toFixed(2) : '0.00'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: '#777b89', fontSize: '13px' }}>
                    Steam ID64
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: '6px',
                      fontSize: '14px',
                      wordBreak: 'break-all',
                    }}
                  >
                    {profile?.steam_id || 'Not set'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: '#777b89', fontSize: '13px' }}>
                    Trade URL
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: '6px',
                      fontSize: '14px',
                      color: profile?.trade_url
                        ? '#6cff9a'
                        : '#ffcc66',
                    }}
                  >
                    {profile?.trade_url
                      ? 'Connected'
                      : 'Not set'}
                  </strong>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (battlePage) {
    return (
      <div className="app">
        <header className="header">
          <div className="logo">
            SKIN<span>BATTLE</span>
          </div>

          <nav className="navigation">
            <button
              className="nav-button active"
              onClick={() => {
                setProfilePage(false)
                setShopPage(false)
                setBattlePage(null)
              }}
            >
              Battles
            </button>

<button
  className={`nav-button ${shopPage ? 'active' : ''}`}
  onClick={() => {
  navigate('/shop')
  }}
>
  Shop
</button>

            <button className="nav-button">
              Upgrade
            </button>

            <button className="nav-button">
              Coin Flip
            </button>
          </nav>

          <div className="header-right">
          {!me && (
  <button
    className="steam-login"
    onClick={loginWithSteam}
  >
    Войти через Steam
  </button>
)}
<button className="balance">
  ₽ {me ? Number(me.balance).toFixed(2) : '0.00'}
</button>
            <button className="language">RU</button>
<button className="profile" onClick={() => {
  navigate('/profile')
 }}
 title="Profile">
  {me?.avatar_url ? (
    <img
      src={me.avatar_url}
      alt={me.username || 'Steam'}
    />
  ) : (
    <span>👤</span>
  )}
</button>
          </div>
        </header>

        <main className="battle-page">
          <button
           className="back-button"
           onClick={() => {
           navigate('/')
           }}
            >
            ← Back to Battles
            </button>

          <div className="battle-page-header">
            <span className="modal-label">BATTLE</span>

            <h1>Battle #{battlePage.id}</h1>

            <span className="battle-page-status">
              {battlePage.status.toUpperCase()}
            </span>
          </div>

          <div className="battle-bank">
            <span>Current Bank</span>
            <strong>{battlePage.bank.toFixed(2)} ₽</strong>
          </div>

          <div className="battle-page-players">
            {battlePage.users.map((user) => {
              const chance =
                battlePage.bank > 0
                  ? ((user.amount / battlePage.bank) * 100).toFixed(2)
                  : '0.00'

              return (
                <div
                  className="battle-player"
                  key={user.username}
                >
                  <div className="battle-player-avatar">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.username}
                      />
                    ) : (
                      <span>👤</span>
                    )}
                  </div>

                  <strong>{user.username}</strong>

                  <span>{user.amount.toFixed(2)} ₽</span>

                  <small>{chance}%</small>
                </div>
              )
            })}

            {Array.from({
              length: Math.max(
                0,
                battlePage.maxPlayers - battlePage.players
              ),
            }).map((_, index) => (
              <div
                className="battle-player-empty"
                key={`empty-${index}`}
              >
                +
              </div>
            ))}
          </div>

          <div className="battle-arena">
            <div className="arena-title">
              BATTLE ROLL
            </div>

<BattleRoll
  rollItems={rollItems}
  isActive={isRolling}
  winner={winnerUsername}
/>

            <div className="arena-status">
              {isFinalizing
                ? 'Finishing...'
                : isRolling
                  ? 'Battle in progress...'
                  : battlePage.players >= 2
                    ? 'Ready to start'
                    : 'Waiting for players...'}
            </div>
          </div>

          <button
            className="start-battle-button"
            disabled={
              battlePage.players < 2 ||
              isRolling ||
              battlePage.status !== 'waiting'
            }
            onClick={async () => {
              try {
                const token =
                  getToken()

                const battleId =
                  Number(battlePage.id)

                // Сбрасываем состояние предыдущей Battle.
                setWinnerUsername(null)
                setWinnerIndex(null)
                setIsFinalizing(false)
                setRollOffset(0)

                // Запускаем Battle на сервере.
                // Все участники также получат BATTLE_STARTED
                // через WebSocket.
                const startResponse =
                  await axios.post(
                    `/api/battles/${battleId}/start/`,
                    {},
                    {
                      headers: {
                        Authorization:
                          `Token ${token}`,
                      },
                    }
                  )

                console.log(
                  'Start Battle response:',
                  startResponse.data
                )

                setBattlePage((prev) => {
                  if (!prev) {
                    return prev
                  }

                  return {
                    ...prev,
                    status: 'active',
                  }
                })

                

                // Ждём основную визуальную прокрутку.
                await new Promise(
                  (resolve) => {
                    setTimeout(
                      resolve,
                      7000
                    )
                  }
                )

                // Даём серверу немного времени закончить Battle.
                // Обычно первый запрос уже вернёт winner,
                // но несколько попыток защищают от гонки
                // по времени между start и process.
                let processResponse = null

                for (
                  let attempt = 1;
                  attempt <= 6;
                  attempt += 1
                ) {
                  const response =
                    await axios.post(
                      `/api/battles/${battleId}/process/`,
                      {},
                      {
                        headers: {
                          Authorization:
                            `Token ${token}`,
                        },
                      }
                    )

                  console.log(
                    `Process Battle response (attempt ${attempt}):`,
                    response.data
                  )

                  processResponse =
                    response

                  if (
                    response.data?.winner
                  ) {
                    break
                  }

                  await new Promise(
                    (resolve) => {
                      setTimeout(
                        resolve,
                        500
                      )
                    }
                  )
                }

                if (
                  !processResponse?.data?.winner
                ) {
                  throw new Error(
                    'Сервер ещё не определил победителя'
                  )
                }

                // Fallback для инициатора.
                // Если BATTLE_FINISHED уже пришёл через
                // WebSocket, finishVisualBattle сам
                // проигнорирует повтор.
                await finishVisualBattle({
                  event:
                    'BATTLE_FINISHED',
                  battle_id:
                    battleId,
                  winner:
                    processResponse.data.winner,
                  total_bank:
                    processResponse.data.total_bank,
                  commission:
                    processResponse.data.commission,
                  prize:
                    processResponse.data.prize,
                })

              } catch (error) {
                console.error(
                  'Start/Process Battle error:',
                  error
                )

                setIsRolling(false)
                setIsFinalizing(false)
                rollingBattleIdRef.current =
                  null

                if (
                  error.response?.data?.error
                ) {
                  alert(
                    error.response.data.error
                  )
                } else {
                  alert(
                    error.message ||
                    'Не удалось запустить Battle'
                  )
                }
              }
            }}

          >
            {isRolling
              ? isFinalizing
                ? 'Finishing...'
                : 'Rolling...'
              : 'Start Battle'}
          </button>

          {battlePage.status === 'waiting' &&
            me?.username &&
            battlePage.users.some(
              (user) =>
                String(user.username).trim().toLowerCase() ===
                String(me.username).trim().toLowerCase()
            ) && (
              <button
                type="button"
                className="leave-battle-button"
                onClick={leaveCurrentBattle}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: '1px solid #3a3d4a',
                  background: '#1a1c23',
                  color: '#ff6b81',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Leave Battle
              </button>
            )}
        </main>
      </div>
    )
  }

if (shopPage) {
  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          SKIN<span>BATTLE</span>
        </div>

        <nav className="navigation">
          <button
  className="nav-button"
  onClick={() => {
    navigate('/')
  }}
>
  Battles
</button>

          <button className="nav-button active">
            Shop
          </button>

          <button className="nav-button">
            Upgrade
          </button>

          <button className="nav-button">
            Coin Flip
          </button>
        </nav>

        <div className="header-right">
        {!me && (
  <button
    className="steam-login"
    onClick={loginWithSteam}
  >
    Войти через Steam
  </button>
)}
          <button className="balance">
            ₽ {me ? Number(me.balance).toFixed(2) : '0.00'}
          </button>

          <button className="language">
            RU
          </button>

<button className="profile" onClick={() => {
  navigate('/profile')
 }}
 title="Profile">
  {me?.avatar_url ? (
    <img
      src={me.avatar_url}
      alt={me.username || 'Steam'}
    />
  ) : (
    <span>👤</span>
  )}
</button>
        </div>
      </header>

      <main className="shop-page">
  <h1>Магазин</h1>

  <p>Выбери скины для игры в батле</p>

 <div className="shop-controls">

  <form
  className="shop-controls"
  onSubmit={(event) => {
    event.preventDefault()

    setShopSearch(
      shopSearchInput.trim()
    )
  }}
>
  <input
    className="shop-search"
    type="text"
    placeholder="Поиск скина..."
    value={shopSearchInput}
    onChange={(event) =>
      setShopSearchInput(
        event.target.value
      )
    }
  />

  <input
    className="shop-price-input"
    type="number"
    min="0"
    placeholder="Min price"
    value={shopMinPrice}
    onChange={(event) =>
      setShopMinPrice(
        event.target.value
      )
    }
  />

  <input
    className="shop-price-input"
    type="number"
    min="0"
    placeholder="Max price"
    value={shopMaxPrice}
    onChange={(event) =>
      setShopMaxPrice(
        event.target.value
      )
    }
  />

  <button
    type="submit"
    className="shop-search-button"
    title="Поиск"
  >
    🔍
  </button>
</form>


</div>

  <div className="shop-grid">
  {filteredShopOffers.length === 0 ? (
    <div>
      No items found
    </div>
  ) : (
    filteredShopOffers.map((offer) => (
              <div
  className="shop-card"
  key={offer.offer_id}
>
  <div className="shop-card-image">
    <img
      src={offer.icon_url}
      alt={offer.market_hash_name}
    />
  </div>

  <h3>
    {offer.market_hash_name}
  </h3>

  <div className="shop-price">
    <span>TM Market</span>
    <strong>
      {Number(offer.tm_price).toFixed(2)} ₽
    </strong>
  </div>

  <div className="shop-price skinbattle-price">
    <span>SkinBattle</span>
    <strong>
      {Number(offer.skinbattle_price).toFixed(2)} SB
    </strong>
  </div>

<button
  onClick={() => buyShopOffer(offer)}
  disabled={buyingOfferId === offer.offer_id}
>
  {buyingOfferId === offer.offer_id
    ? 'Buying...'
    : 'Buy'}
</button>
</div>
            ))
          )}
        </div>

        {shopOffers.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '28px',
            }}
          >
            {shopHasMore ? (
              <button
                type="button"
                onClick={loadMoreShopOffers}
                disabled={shopLoading}
                style={{
                  minWidth: '180px',
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '10px',
                  background: shopLoading
                    ? '#555'
                    : '#8b5cf6',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: shopLoading
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                {shopLoading
                  ? 'Loading...'
                  : 'Показать ещё'}
              </button>
            ) : (
              <span
                style={{
                  color: '#737786',
                  fontSize: '13px',
                }}
              >
                Все доступные предложения загружены
              </span>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          SKIN<span>BATTLE</span>
        </div>

       <nav className="navigation">
<button
  className={`nav-button ${!shopPage ? 'active' : ''}`}
  onClick={() => {
    setShopPage(false)
    setBattlePage(null)
  }}
>
  Battles
</button>

<button
  className={`nav-button ${shopPage ? 'active' : ''}`}
  onClick={() => {
    navigate('/shop')
  }}
>
  Shop
</button>

  <button className="nav-button">
    Upgrade
  </button>

  <button className="nav-button">
    Coin Flip
  </button>
</nav>

        <div className="header-right">
        {!me && (
  <button
    className="steam-login"
    onClick={loginWithSteam}
  >
    Войти через Steam
  </button>
)}
<button className="balance">
  ₽ {me ? Number(me.balance).toFixed(2) : '0.00'}
</button>

          <button className="language">
            RU
          </button>

<button className="profile" onClick={openProfile} title="Profile">
  {me?.avatar_url ? (
    <img
      src={me.avatar_url}
      alt={me.username || 'Steam'}
    />
  ) : (
    <span>👤</span>
  )}
</button>
        </div>
      </header>

      <main className="main-content">
        <div className="page-title">
          <div>
            <h1>Battles</h1>
            <p>Join a battle or create your own</p>
          </div>

          <button
            className="create-battle"
            onClick={() => {
              setMaxPlayers(2)
              setCreateModalOpen(true)
            }}
          >
            + Create Battle
          </button>
        </div>

        <div className="battles-grid">
          {apiBattles.map((battle) => (
            <div
              className="battle-card"
              key={battle.id}
            >
              <div className="battle-header">
                <button
                 className="battle-id battle-id-button"
                 onClick={() => {
                 navigate(`/battle/${battle.id}`)
                 }}
                 >
                 Battle #{battle.id}
                </button>

                <span className="battle-status">
                  {battle.status.toUpperCase()}
                </span>
              </div>

              <div className="battle-players">
                {battle.users.map((user) => (
                  <div
                    className="player"
                    key={user.username}
                  >
                    <div className="avatar">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.username}
                        />
                      ) : (
                        <span>👤</span>
                      )}
                    </div>

                    <span>{user.username}</span>
                  </div>
                ))}

                {Array.from({
                  length: Math.max(
                    0,
                    battle.maxPlayers - battle.players
                  ),
                }).map((_, index) => (
                  <div
                    className="player-empty"
                    key={`empty-${index}`}
                  >
                    +
                  </div>
                ))}
              </div>

              <div className="battle-info">
                <div>
                  <span>Bank</span>
                  <strong>
                    {battle.bank.toFixed(2)} ₽
                  </strong>
                </div>

                <div>
                  <span>Players</span>
                  <strong>
                    {battle.players} / {battle.maxPlayers}
                  </strong>
                </div>
              </div>

              <button
                className="join-battle"
                onClick={() => {
                  setSelectedBattle(battle)
                  setBetAmount('')
                }}
              >
                Join Battle
              </button>
            </div>
          ))}
                </div>

        <div style={{ marginTop: '40px' }}>
         <div
  className="page-title"
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
  }}
>
  <div>
    <h1>Inventory</h1>
    <p>Your skins</p>
  </div>

  <button
    onClick={sellAllInventory}
    style={{
      background: '#9147ff',
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      padding: '12px 20px',
      fontSize: '15px',
      fontWeight: '700',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    💰 Sell All
  </button>
</div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '20px',
            }}
          >
            {inventory.map((item) => (
              <div
  key={item.id}
  style={{
    background: '#15161d',
    border: '1px solid #292b36',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
  }}
>
                <img
                  src={item.icon_url}
                  alt={item.market_hash_name}
                  style={{
                    width: '100%',
                    height: '140px',
                    objectFit: 'contain',
                  }}
                />

                <div
                  style={{
                    marginTop: '10px',
                    fontWeight: '600',
                  }}
                >
                  {item.market_hash_name}
                </div>

                <div
                  style={{
                    marginTop: '8px',
                    color: '#aaa',
                  }}
                >
                  Float: {item.float_value ?? '—'}
                </div>

                <div
                  style={{
                    marginTop: '6px',
                    fontSize: '18px',
                    fontWeight: '700',
                  }}
                >
                  {Number(item.skinbattle_price).toFixed(2)} SB
                </div>

<div
  style={{
    marginTop: '8px',
    fontSize: '13px',
    color:
      item.status === 'available'
        ? '#6cff9a'
        : '#ff6c6c',
  }}
>
  {item.status === 'available'
    ? 'Tradable'
    : 'Not tradable'}
</div>
                <div
  style={{
    marginTop: '6px',
    fontSize: '13px',
    color:
      item.status === 'available'
        ? '#6cff9a'
        : '#ffcc66',
  }}
>
  {item.status === 'available'
    ? 'Available'
    : item.status}
</div>

<button
  className="inventory-select-button"
  disabled={item.status !== 'available'}
  onClick={() => {
    setSelectedInventoryItem(item)
    console.log('SELECTED INVENTORY ITEM:', item)
  }}
  style={{
  border: 'none',
  borderRadius: '8px',
  background:
    item.status !== 'available'
      ? '#333'
      : '#8b5cf6',
  color: '#fff',
  fontWeight: '600',
  cursor:
    item.status !== 'available'
      ? 'not-allowed'
      : 'pointer',
}}
>
 {item.status !== 'available'
  ? '🔒 In Battle'
  : selectedInventoryItem?.id === item.id
    ? 'Selected'
    : 'Select'}
</button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {selectedBattle && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedBattle(null)}
        >
          <div
            className="join-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="modal-label">
                  BATTLE
                </span>

                <h2>
                  Battle #{selectedBattle.id}
                </h2>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelectedBattle(null)}
              >
                ×
              </button>
            </div>

            <div className="modal-bank">
              <span>Current Bank</span>

              <strong>
                {selectedBattle.bank.toFixed(2)} ₽
              </strong>
            </div>

            <div className="modal-section">
  <label>Your skin</label>

  {selectedInventoryItem ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '12px',
        borderRadius: '10px',
        background: '#15161d',
        border: '1px solid #292b36',
      }}
    >
      <img
        src={selectedInventoryItem.icon_url}
        alt={selectedInventoryItem.market_hash_name}
        style={{
          width: '80px',
          height: '60px',
          objectFit: 'contain',
        }}
      />

      <div>
        <div style={{ fontWeight: '600' }}>
          {selectedInventoryItem.market_hash_name}
        </div>

        <div
          style={{
            marginTop: '5px',
            color: '#aaa',
            fontSize: '13px',
          }}
        >
          Float: {selectedInventoryItem.float_value ?? '—'}
        </div>

        <div
          style={{
            marginTop: '5px',
            fontWeight: '700',
          }}
        >
          {Number(selectedInventoryItem.skinbattle_price).toFixed(2)} SB
        </div>
      </div>
    </div>
  ) : (
    <div
      style={{
        padding: '16px',
        borderRadius: '10px',
        background: '#15161d',
        color: '#888',
      }}
    >
      Select a skin from your inventory
    </div>
  )}
</div>

            <div className="bet-preview">
              <div>
  <span>Your chance</span>

  <strong>
    {selectedInventoryItem
      ? (
          Number(selectedInventoryItem.skinbattle_price) /
          (
            Number(selectedBattle.bank) +
            Number(selectedInventoryItem.skinbattle_price)
          )
        ) * 100
      : 0
    }
    %
  </strong>
</div>

<div>
  <span>Potential win</span>

  <strong>
    {selectedInventoryItem
      ? (
          Number(selectedInventoryItem.skinbattle_price) +
          Number(selectedBattle.bank)
        ).toFixed(2)
      : '0.00'
    }{' '}
    SB
  </strong>
</div>
            </div>

            <button
  className="modal-join"
  onClick={async () => {
    if (!selectedInventoryItem) {
  alert('Сначала выберите скин')
  return
}

    try {
      const token = getToken()

      const response = await axios.post(
        `/api/battles/${selectedBattle.id}/join/`,
        {
  inventory_item_id: selectedInventoryItem.id,
},
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      console.log('Join Battle response:', response.data)

      // Получаем актуальную Battle с сервера
      const battleResponse = await axios.get(
        `/api/battles/${selectedBattle.id}/`,
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      // Обновляем список Battle
      const battlesResponse = await axios.get(
        '/api/battles/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      setApiBattles(
  battlesResponse.data.map(normalizeBattle)
)

      setSelectedBattle(null)
      setBetAmount('')

      alert('Вы успешно вошли в Battle')

      // Открываем актуальную Battle
      setBattlePage(normalizeBattle(battleResponse.data))

    } catch (error) {
      console.error('Join Battle error:', error)

      if (error.response?.data?.error) {
        alert(error.response.data.error)
      } else {
        alert('Не удалось войти в Battle')
      }
    }
  }}
>
  Join Battle
</button>

            <p className="modal-note">
              By joining this battle, your bet will be
              locked until the battle ends.
            </p>
          </div>
        </div>
      )}

      {createModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="create-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <span className="modal-label">
                  NEW BATTLE
                </span>

                <h2>Create Battle</h2>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setCreateModalOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div className="create-section">
              <label>Maximum players</label>

              <div className="player-options">
                {[2, 3, 4, 5, 10].map((count) => (
                  <button
                    key={count}
                    className={`player-option ${
                      maxPlayers === count
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() =>
                      setMaxPlayers(count)
                    }
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            {me?.is_staff && (
  <button
    onClick={() => setAdminPage(true)}
  >
    Admin Panel
  </button>
)}

            <div className="create-preview">
              <div>
                <span>Players</span>
                <strong>{maxPlayers}</strong>
              </div>

              <div>
                <span>Commission</span>
                <strong>2%</strong>
              </div>
            </div>

            <button
  className="modal-join"
  disabled={
    creatingBattle ||
    createBattleCooldown > 0
  }
onClick={async () => {
  if (creatingBattle || createBattleCooldown > 0) {
    return
  }

  setCreatingBattle(true)

  try {
    const token = getToken()

    const response = await axios.post(
      '/api/battles/create/',
      {
        max_players: maxPlayers,
      },
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    console.log(
      'Create Battle response:',
      response.data
    )

    // Запускаем локальный cooldown.
    setCreateBattleCooldown(5)

    // Обновляем список Battle
    const battlesResponse = await axios.get(
      '/api/battles/',
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    setApiBattles(
      battlesResponse.data.map(normalizeBattle)
    )

    // Закрываем окно
    setCreateModalOpen(false)

    alert(
      `Battle #${response.data.id} создана`
    )

  } catch (error) {
    console.error(
      'Create Battle error:',
      error
    )

    if (error.response?.data?.error) {
      alert(error.response.data.error)
    } else if (error.response?.status === 429) {
      alert(
        'Слишком много запросов. Подождите немного.'
      )
    } else {
      alert('Не удалось создать Battle')
    }

  } finally {
    setCreatingBattle(false)
  }
}}
>
   {creatingBattle
    ? 'Creating...'
    : createBattleCooldown > 0
      ? `Wait ${createBattleCooldown}s`
      : 'Create Battle'}
</button>

            <p className="modal-note">
              You can start the battle when at least 2
              players join.
            </p>
          </div>
        </div>
      )}

      {/* ===== GLOBAL CHAT ===== */}

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>🌐 Общий чат</span>

            <button
              type="button"
              onClick={() => setChatOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">
                Пока сообщений нет
              </div>
            ) : (
              chatMessages.map((msg, index) => (
                <div
                  className="chat-message"
                  key={`${msg.created_at}-${index}`}
                >
                  <img
                    src={
                      msg.avatar_url ||
                      'https://via.placeholder.com/40'
                    }
                    alt=""
                    className="chat-avatar"
                  />

                  <div className="chat-message-content">
                    <div className="chat-username">
                      {msg.username}
                    </div>

                    <div className="chat-text">
                      {msg.message}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              value={chatInput}
              onChange={(event) =>
                setChatInput(event.target.value)
              }
              placeholder="Написать сообщение..."
              maxLength={300}
            />

            <button
              type="button"
              onClick={() => {
                const message = chatInput.trim()

                if (!message) {
                  return
                }

                if (
                  chatSocketRef.current &&
                  chatSocketRef.current.readyState === WebSocket.OPEN
                ) {
                  chatSocketRef.current.send(
                    JSON.stringify({
                      message,
                    })
                  )

                  setChatInput('')
                }
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {!chatOpen && (
        <button
          type="button"
          className="chat-open-button"
          onClick={() => setChatOpen(true)}
        >
          💬 Чат
        </button>
      )}

    </div>
  )
}

export default App


