import { useEffect, useState } from 'react'
import {
  useLocation,
  useNavigate,
} from 'react-router-dom'

function AdminPanel({ token, onClose }) {

  const navigate = useNavigate()
  const location = useLocation()

  const [activePage, setActivePage] = useState('dashboard')

  useEffect(() => {
  if (location.pathname === '/admin') {
    setActivePage('dashboard')
    setSelectedLog(null)
    return
  }

  if (location.pathname === '/admin/users') {
    setActivePage('users')
    setSelectedLog(null)
    return
  }

  if (location.pathname.startsWith('/admin/logs')) {
    setActivePage('logs')
    return
  }
}, [location.pathname])

  const [data, setData] = useState(null)
  const [users, setUsers] = useState([])
  const [savingRoleUserId, setSavingRoleUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)

  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [logs, setLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsSearch, setLogsSearch] = useState('')
  const [logsAction, setLogsAction] = useState('')
  const [logsDateFrom, setLogsDateFrom] = useState('')
  const [logsDateTo, setLogsDateTo] = useState('')
  const logMatch = location.pathname.match(/^\/admin\/logs\/(\d+)$/)
  const selectedLogId = logMatch ? Number(logMatch[1]) : null


  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(
        '/api/admin/dashboard/',
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      )

      if (!response.ok) {
         if (response.status === 403) {
             navigate('/')
             return
            }

            throw new Error(
                `Ошибка сервера: ${response.status}`
            )
          }

      const result = await response.json()

      setData(result)

    } catch (err) {
      setError(err.message)

    } finally {
      setLoading(false)
    }
  }


  const loadUsers = async (query = '') => {
    try {
      setUsersLoading(true)
      setError('')

      const url =
        `/api/admin/users/?q=${encodeURIComponent(query)}`

      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${token}`,
        },
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            'У вас нет доступа к пользователям'
          )
        }

        throw new Error(
          `Ошибка сервера: ${response.status}`
        )
      }

      const result = await response.json()

      setUsers(result.users || [])

    } catch (err) {
      setError(err.message)

    } finally {
      setUsersLoading(false)
    }
  }
  const loadLogs = async () => {
  try {
    setLogsLoading(true)
    setError('')

    const params = new URLSearchParams()

    if (logsSearch.trim()) {
      params.set('search', logsSearch.trim())
    }

    if (logsAction) {
      params.set('action', logsAction)
    }

    if (logsDateFrom) {
      params.set('date_from', logsDateFrom)
    }

    if (logsDateTo) {
      params.set('date_to', logsDateTo)
    }

    const query = params.toString()

    const response = await fetch(
      `/api/admin/audit-logs/${query ? `?${query}` : ''}`,
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.detail || `Ошибка сервера: ${response.status}`
      )
    }

    const loadedLogs = result.logs || []

setLogs(loadedLogs)

if (selectedLogId) {
  const foundLog = loadedLogs.find(
    (log) => Number(log.id) === selectedLogId
  )

  setSelectedLog(foundLog || null)
} else {
  setSelectedLog(null)
}
  } catch (err) {
    setError(err.message)
  } finally {
    setLogsLoading(false)
  }
}

  const changeUserRole = async (userId, role) => {
    try {
      setSavingRoleUserId(userId)
      setError('')

      const response = await fetch(
        `/api/admin/users/${userId}/role/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${token}`,
          },
          body: JSON.stringify({ role: role }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.detail || `Ошибка сервера: ${response.status}`)
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? { ...user, role: result.role, is_staff: result.is_staff }
            : user
        )
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingRoleUserId(null)
    }
  }

  const changeUserBan = async (userId, banned) => {
    const user = users.find((item) => item.id === userId)
    if (!user) return

    const action = banned ? 'заблокировать' : 'разблокировать'
    const confirmed = window.confirm(
      `Вы уверены, что хотите ${action} пользователя "${user.username}"?`
    )
    if (!confirmed) return

    try {
      setError('')
      const response = await fetch(
        `/api/admin/users/${userId}/ban/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${token}`,
          },
          body: JSON.stringify({ banned: banned }),
        }
      )

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.detail || `Ошибка сервера: ${response.status}`)
      }

      setUsers((currentUsers) =>
        currentUsers.map((item) =>
          item.id === userId
            ? { ...item, is_active: result.is_active }
            : item
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])


  useEffect(() => {
    if (activePage === 'users') {
      loadUsers(search)
    }
  }, [activePage])

  useEffect(() => {
  if (activePage === 'logs') {
    loadLogs()
  }
}, [activePage, selectedLogId])


  const formatMoney = (value) => {
    return (
      Number(value || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' ₽'
    )
  }


  const openUsers = () => {
    setActivePage('users')
    loadUsers(search)
  }


  return (
    <div className="admin-page">

      {/* SIDEBAR */}

      <aside className="admin-sidebar">

        <div className="admin-logo">

          <div className="admin-logo-icon">
            S
          </div>

          <div>
            <div className="admin-logo-title">
              SKINBATTLE
            </div>

            <div className="admin-logo-subtitle">
              ADMIN PANEL
            </div>
          </div>

        </div>


        <div className="admin-menu">

          <button
            className={
              `admin-menu-item ${
                activePage === 'dashboard'
                  ? 'active'
                  : ''
              }`
            }
            onClick={() => navigate('/admin')}
          >
            <span>⌂</span>
            Dashboard
          </button>


          <button
            className={
              `admin-menu-item ${
                activePage === 'users'
                  ? 'active'
                  : ''
              }`
            }
            onClick={() => navigate('/admin/users')}
          >
            <span>♙</span>
            Users
          </button>


          <button className="admin-menu-item">
            <span>⚔</span>
            Battles
          </button>


          <button className="admin-menu-item">
            <span>▣</span>
            Inventory
          </button>


          <button className="admin-menu-item">
            <span>₽</span>
            Wallet
          </button>


          <button className="admin-menu-item">
            <span>🛒</span>
            Shop
          </button>


          <button className="admin-menu-item">
            <span>↗</span>
            Withdraw
          </button>

          <button
  className={
    `admin-menu-item ${
      activePage === 'logs'
        ? 'active'
        : ''
    }`
  }
  onClick={() => navigate('/admin/logs')}
>
  <span>◉</span>
  Logs
</button>

        </div>


        <div className="admin-sidebar-bottom">

          <button className="admin-menu-item">
            <span>⚙</span>
            Settings
          </button>

          <button
            className="admin-back-button"
            onClick={onClose}
          >
            ← Back to SkinBattle
          </button>

        </div>

      </aside>


      {/* MAIN */}

      <main className="admin-main">

        {/* USERS PAGE */}

        {activePage === 'users' && (

          <>

            <header className="admin-header">

              <div>

                <div className="admin-breadcrumb">
                  ADMIN PANEL / USERS
                </div>

                <h1>
                  Users
                </h1>

                <p>
                  Manage registered SkinBattle users
                </p>

              </div>


              <div className="admin-header-right">

                <button
                  className="admin-refresh"
                  onClick={() => loadUsers(search)}
                >
                  ↻ Refresh
                </button>

              </div>

            </header>


            <div className="admin-users-toolbar">

              <div className="admin-search">

                <span>
                  ⌕
                </span>

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      loadUsers(search)
                    }
                  }}
                  placeholder="Search username or Steam ID..."
                />

              </div>


              <button
                className="admin-search-button"
                onClick={() => loadUsers(search)}
              >
                Search
              </button>

            </div>


            <div className="admin-users-card">

              <div className="admin-users-card-header">

                <div>

                  <h2>
                    All Users
                  </h2>

                  <p>
                    {users.length} users loaded
                  </p>

                </div>

              </div>


              {usersLoading ? (

                <div className="admin-loading">
                  <div className="admin-spinner"></div>
                  <span>
                    Loading users...
                  </span>
                </div>

              ) : users.length === 0 ? (

                <div className="admin-empty">
                  Users not found
                </div>

              ) : (

                <div className="admin-users-table">

                  <div className="admin-user-row admin-user-row-head">

                    <div>ID</div>
                    <div>USER</div>
                    <div>STEAM ID</div>
                    <div>BALANCE</div>
                   <div>INVENTORY</div>
                   <div>BATTLES</div>
                   <div>ROLE</div>
                   <div>STATUS</div>
                   <div>ACTION</div>

                  </div>


                  {users.map((user) => (

                    <div
                      className="admin-user-row"
                      key={user.id}
                    >

                      <div className="admin-user-id">
                        #{user.id}
                      </div>


                      <div className="admin-user-profile">

                        {user.avatar_url ? (

                          <img
                            src={user.avatar_url}
                            alt=""
                          />

                        ) : (

                          <div className="admin-table-avatar">
                            {user.username
                              ?.charAt(0)
                              ?.toUpperCase() || '?'}
                          </div>

                        )}


                        <div>

                          <strong>
                            {user.username}
                          </strong>

                          {user.role === 'admin' && (
                            <small className="admin-badge">
                              ADMIN
                            </small>
                          )}

                        </div>

                      </div>


                      <div className="admin-steam-id">

                        {user.steam_id
                          ? user.steam_id
                          : '—'}

                      </div>


                      <div className="admin-user-balance">

                        {formatMoney(user.balance)}

                      </div>


                      <div>

                        {user.inventory_count}

                      </div>


                      <div>

                        {user.battles_count}

                      </div>

                      <div className="admin-user-role">
  <select
    value={user.role || 'user'}
    disabled={
      savingRoleUserId === user.id ||
      user.id === 9
    }
    onChange={(event) =>
      changeUserRole(user.id, event.target.value)
    }
  >
    <option value="user">User</option>
    <option value="manager">Manager</option>
    <option value="admin">Admin</option>
  </select>

  {savingRoleUserId === user.id && (
    <span className="role-saving">
      Saving...
    </span>
  )}
</div>

                      <div>

                        {user.is_active ? (

                          <span className="user-status active">
                            ● Active
                          </span>

                        ) : (

                          <span className="user-status blocked">
                            ● Blocked
                          </span>

                        )}

                      </div>

                      <div className="admin-user-action">
  {user.role === 'admin' ? (
    <button
      className="admin-ban-button disabled"
      disabled
    >
      Protected
    </button>
  ) : user.is_active ? (
    <button
      className="admin-ban-button"
      onClick={() => changeUserBan(user.id, true)}
    >
      Ban
    </button>
  ) : (
    <button
      className="admin-unban-button"
      onClick={() => changeUserBan(user.id, false)}
    >
      Unban
    </button>
  )}
</div>

                    </div>

                  ))}

                </div>

              )}

            </div>

          </>

        )}

        {/* LOGS PAGE */}
        {activePage === 'logs' && (
          <>
            <header className="admin-header">
              <div>
                <div className="admin-breadcrumb">
                  ADMIN PANEL / LOGS
                </div>

                <h1>
                  Audit Logs
                </h1>

                <p>
                  Complete history of important user actions
                </p>
              </div>

              <div className="admin-header-right">
                <button
                  className="admin-refresh"
                  onClick={loadLogs}
                >
                  ↻ Refresh
                </button>
              </div>
            </header>
<div className="admin-logs-filters">

  <div className="admin-logs-filter admin-logs-search">
    <label>Search</label>

    <input
      type="text"
      value={logsSearch}
      onChange={(event) => setLogsSearch(event.target.value)}
      placeholder="Username, action, description or IP..."
    />
  </div>


  <div className="admin-logs-filter">
    <label>Action</label>

    <select
  value={logsAction}
  onChange={(event) => setLogsAction(event.target.value)}
>
  <option value="">All actions</option>

  <option value="battle_created">
    Battle created
  </option>

  <option value="battle_started">
    Battle started
  </option>

  <option value="battle_joined">
    Battle joined
  </option>

  <option value="battle_left">
    Battle left
  </option>

  <option value="battle_finished">
    Battle finished
  </option>

  <option value="battle_cancelled">
    Battle cancelled
  </option>

  <option value="bet_placed">
    Bet placed
  </option>

  <option value="item_locked">
    Item locked
  </option>

  <option value="item_received">
    Item received
  </option>

  <option value="role_changed">
    Role changed
  </option>

  <option value="shop_purchase">
    Shop purchase
  </option>

  <option value="user_banned">
    User banned
  </option>

  <option value="user_unbanned">
    User unbanned
  </option>

  <option value="win">
    Win
  </option>
</select>
  </div>


  <div className="admin-logs-filter">
    <label>From</label>

    <input
      type="date"
      value={logsDateFrom}
      onChange={(event) => setLogsDateFrom(event.target.value)}
    />
  </div>


  <div className="admin-logs-filter">
    <label>To</label>

    <input
      type="date"
      value={logsDateTo}
      onChange={(event) => setLogsDateTo(event.target.value)}
    />
  </div>


  <button
    type="button"
    className="admin-logs-apply"
    onClick={loadLogs}
  >
    Apply
  </button>


  <button
    type="button"
    className="admin-logs-clear"
    onClick={() => {
      setLogsSearch('')
      setLogsAction('')
      setLogsDateFrom('')
      setLogsDateTo('')

      setTimeout(() => {
        loadLogs()
      }, 0)
    }}
  >
    Clear
  </button>

</div>

            <div className="admin-users-card">
              <div className="admin-users-card-header">
                <div>
                  <h2>
                    User Activity
                  </h2>

                  <p>
                    {logs.length} log records
                  </p>
                </div>
              </div>


              {logsLoading ? (
                <div className="admin-loading">
                  <div className="admin-spinner"></div>

                  <span>
                    Loading logs...
                  </span>
                </div>
              ) : logs.length === 0 ? (
                <div className="admin-empty">
                  No logs found
                </div>
              ) : (
                <div className="admin-users-table">

                  <div className="admin-log-row admin-log-row-head">
                    <div>ID</div>
                    <div>USER</div>
                    <div>ACTION</div>
                    <div>DESCRIPTION</div>
                    <div>IP</div>
                    <div>DATE</div>
                  </div>


                  {logs.map((log) => (
  <div
    className="admin-log-row"
    key={log.id}
    onClick={() => navigate(`/admin/logs/${log.id}`)}
    style={{ cursor: 'pointer' }}
  >

                      <div className="admin-log-id">
                        #{log.id}
                      </div>


                      <div className="admin-log-user">
                        {log.username}
                      </div>


                      <div>
                        <span className="admin-log-action">
                          {log.action}
                        </span>
                      </div>


                      <div className="admin-log-description">
                        {log.description || '—'}
                      </div>


                      <div className="admin-log-ip">
                        {log.ip_address || '—'}
                      </div>


                      <div className="admin-log-date">
                        {new Date(
                          log.created_at
                        ).toLocaleString('ru-RU')}
                      </div>

                    </div>
                  ))}

                </div>
              )}
            </div>
          </>
        )}

        {/* DASHBOARD PAGE */}

        {activePage === 'dashboard' && (

          <>

            <header className="admin-header">

              <div>

                <div className="admin-breadcrumb">
                  ADMIN PANEL / DASHBOARD
                </div>

                <h1>
                  Dashboard
                </h1>

                <p>
                  Overview of your SkinBattle platform
                </p>

              </div>


              <div className="admin-header-right">

                <button
                  className="admin-refresh"
                  onClick={loadDashboard}
                >
                  ↻ Refresh
                </button>


                <div className="admin-user">

                  <div className="admin-user-avatar">
                    A
                  </div>

                  <div>

                    <div className="admin-user-name">
                      Administrator
                    </div>

                    <div className="admin-user-status">
                      ● Online
                    </div>

                  </div>

                </div>

              </div>

            </header>


            {loading && (

              <div className="admin-loading">

                <div className="admin-spinner"></div>

                <span>
                  Загрузка статистики...
                </span>

              </div>

            )}


            {error && (

              <div className="admin-error">

                <strong>
                  Ошибка
                </strong>

                <span>
                  {error}
                </span>

                <button onClick={loadDashboard}>
                  Повторить
                </button>

              </div>

            )}


            {!loading && !error && data && (

              <>

                <section className="admin-stats">

                  <div className="admin-stat-card">

                    <div className="admin-stat-top">

                      <div className="admin-stat-icon purple">
                        👥
                      </div>

                      <span className="admin-stat-label">
                        USERS
                      </span>

                    </div>

                    <div className="admin-stat-value">
                      {data.users}
                    </div>

                    <div className="admin-stat-bottom">
                      Registered users
                    </div>

                  </div>


                  <div className="admin-stat-card">

                    <div className="admin-stat-top">

                      <div className="admin-stat-icon blue">
                        ⚔
                      </div>

                      <span className="admin-stat-label">
                        BATTLES
                      </span>

                    </div>

                    <div className="admin-stat-value">
                      {data.battles}
                    </div>

                    <div className="admin-stat-bottom">
                      Total battles
                    </div>

                  </div>


                  <div className="admin-stat-card">

                    <div className="admin-stat-top">

                      <div className="admin-stat-icon green">
                        🎒
                      </div>

                      <span className="admin-stat-label">
                        INVENTORY
                      </span>

                    </div>

                    <div className="admin-stat-value">
                      {data.inventory_items}
                    </div>

                    <div className="admin-stat-bottom">
                      Inventory items
                    </div>

                  </div>


                  <div className="admin-stat-card">

                    <div className="admin-stat-top">

                      <div className="admin-stat-icon orange">
                        💸
                      </div>

                      <span className="admin-stat-label">
                        WITHDRAW
                      </span>

                    </div>

                    <div className="admin-stat-value">
                      {data.pending_withdrawals}
                    </div>

                    <div className="admin-stat-bottom">
                      Pending withdrawals
                    </div>

                  </div>

                </section>


                <section className="admin-money-card">

                  <div className="admin-money-left">

                    <div className="admin-money-icon">
                      ₽
                    </div>

                    <div>

                      <div className="admin-money-label">
                        TOTAL PLATFORM BALANCE
                      </div>

                      <div className="admin-money-value">
                        {formatMoney(
                          data.total_balance
                        )}
                      </div>

                      <div className="admin-money-description">
                        Combined balance of all user wallets
                      </div>

                    </div>

                  </div>


                  <div className="admin-money-status">

                    <span className="admin-status-dot"></span>

                    System operational

                  </div>

                </section>


                <section className="admin-grid">

                  <div className="admin-panel-card">

                    <div className="admin-card-header">

                      <div>

                        <h2>
                          Quick Actions
                        </h2>

                        <p>
                          Frequently used administration tools
                        </p>

                      </div>

                    </div>


                    <div className="admin-actions">

                      <button onClick={openUsers}>

                        <span>👥</span>

                        <div>

                          <strong>
                            Manage Users
                          </strong>

                          <small>
                            View and manage users
                          </small>

                        </div>

                        <b>
                          →
                        </b>

                      </button>


                      <button>

                        <span>⚔</span>

                        <div>

                          <strong>
                            View Battles
                          </strong>

                          <small>
                            Monitor all battles
                          </small>

                        </div>

                        <b>
                          →
                        </b>

                      </button>


                      <button>

                        <span>💸</span>

                        <div>

                          <strong>
                            Withdrawals
                          </strong>

                          <small>
                            Process pending withdrawals
                          </small>

                        </div>

                        <b>
                          →
                        </b>

                      </button>

                      <button
  className={
    `admin-menu-item ${
      activePage === 'logs'
        ? 'active'
        : ''
    }`
  }
  onClick={() => navigate('/admin/logs')}
>
  <span>◉</span>
  Logs
</button>

                    </div>

                  </div>


                  <div className="admin-panel-card">

                    <div className="admin-card-header">

                      <div>

                        <h2>
                          System Status
                        </h2>

                        <p>
                          Current platform status
                        </p>

                      </div>

                    </div>


                    <div className="system-status-list">

                      <div>
                        <span className="status-ok"></span>
                        <span>Backend API</span>
                        <strong>Online</strong>
                      </div>

                      <div>
                        <span className="status-ok"></span>
                        <span>Database</span>
                        <strong>Online</strong>
                      </div>

                      <div>
                        <span className="status-ok"></span>
                        <span>Battle System</span>
                        <strong>Online</strong>
                      </div>

                      <div>
                        <span className="status-ok"></span>
                        <span>Inventory</span>
                        <strong>Online</strong>
                      </div>

                    </div>

                  </div>

                </section>

              </>

            )}

          </>

        )}

      {selectedLog && (
  <div
    className="admin-log-modal-overlay"
    onClick={() => navigate('/admin/logs')}
  >
    <div
      className="admin-log-modal"
      onClick={(event) => event.stopPropagation()}
    >

            <div className="admin-log-modal-header">

              <div>
                <span className="admin-log-modal-label">
                  AUDIT LOG
                </span>

                <h2>
                  Log #{selectedLog.id}
                </h2>
              </div>

              <button
  type="button"
  className="admin-log-modal-close"
  onClick={() => navigate('/admin/logs')}
>
  ×
</button>

            </div>


            <div className="admin-log-details">

              <div className="admin-log-detail">
                <span>User</span>
                <strong>
                  {selectedLog.username || 'Unknown'}
                </strong>
              </div>


              <div className="admin-log-detail">
                <span>Action</span>
                <strong className="admin-log-action">
                  {selectedLog.action || '—'}
                </strong>
              </div>


              <div className="admin-log-detail admin-log-detail-wide">
                <span>Description</span>
                <strong>
                  {selectedLog.description || '—'}
                </strong>
              </div>


              <div className="admin-log-detail">
                <span>IP Address</span>
                <strong>
                  {selectedLog.ip_address || '—'}
                </strong>
              </div>


              <div className="admin-log-detail">
                <span>Date</span>
                <strong>
                  {selectedLog.created_at
                    ? new Date(
                        selectedLog.created_at
                      ).toLocaleString('ru-RU')
                    : '—'}
                </strong>
              </div>


              <div className="admin-log-detail admin-log-detail-wide">
                <span>User Agent</span>

                <div className="admin-log-detail-value admin-log-user-agent">
                  {selectedLog.user_agent || '—'}
                </div>
              </div>


              <div className="admin-log-detail admin-log-detail-wide">
                <span>Metadata</span>

                <pre className="admin-log-metadata">
                  {selectedLog.metadata
                    ? JSON.stringify(
                        selectedLog.metadata,
                        null,
                        2
                      )
                    : '—'}
                </pre>
              </div>

            </div>

          </div>
        </div>
      )}

      </main>

    </div>
  )
}

export default AdminPanel
