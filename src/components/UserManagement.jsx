import React, { useState, useEffect } from 'react';
import { authUtils } from '../utils/auth';

// Simple user-agent parser for the Device column
function parseUserAgent(ua) {
  if (!ua) return 'Unknown';
  let browser = 'Unknown';
  let os = 'Unknown';
  // Browser detection
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'IE';
  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return `${browser} / ${os}`;
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'user'
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Edit user state
  const [editingUser, setEditingUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Reset password state
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Login activity state
  const [showLoginActivity, setShowLoginActivity] = useState(false);
  const [loginActivity, setLoginActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityUserId, setActivityUserId] = useState(null);
  const [activityTotal, setActivityTotal] = useState(0);
  const ACTIVITY_PAGE_SIZE = 100;

  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/auth/admin/users`, {
        headers: authUtils.getAuthHeader()
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      setMessage({ type: 'error', text: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      if (!newUser.username || !newUser.password) {
        setMessage({ type: 'error', text: 'Username and password are required' });
        return;
      }

      if (newUser.password.length < 6) {
        setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
        return;
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newUser.password)) {
        setMessage({ type: 'error', text: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
        return;
      }

      setLoading(true);
      const response = await fetch(`${apiUrl}/api/auth/admin/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authUtils.getAuthHeader()
        },
        body: JSON.stringify(newUser)
      });

      const data = await response.json();

      if (!response.ok) {
        const details = data.details;
        if (details && details.length > 0) {
          throw new Error(details.map(d => d.msg || d.message).join('. '));
        }
        throw new Error(data.error || 'Failed to create user');
      }

      setMessage({ type: 'success', text: 'User created successfully!' });
      setNewUser({
        username: '',
        email: '',
        password: '',
        fullName: '',
        role: 'user'
      });
      setShowCreateForm(false);
      loadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
    setMessage({ type: '', text: '' });
  };

  const handleEditClick = (user) => {
    setEditingUser({
      id: user.id,
      username: user.username,
      email: user.email || '',
      fullName: user.fullName || '',
      role: user.role,
      isActive: user.isActive
    });
    setShowEditModal(true);
    setMessage({ type: '', text: '' });
  };

  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditingUser(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      if (!editingUser.username) {
        setMessage({ type: 'error', text: 'Username is required' });
        return;
      }

      setLoading(true);
      const response = await fetch(`${apiUrl}/api/auth/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authUtils.getAuthHeader()
        },
        body: JSON.stringify({
          username: editingUser.username,
          email: editingUser.email,
          fullName: editingUser.fullName,
          role: editingUser.role,
          isActive: editingUser.isActive
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setMessage({ type: 'success', text: 'User updated successfully!' });
      setShowEditModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordClick = (user) => {
    setResetPasswordUser(user);
    setNewPassword('');
    setShowNewPassword(false);
    setShowResetPasswordModal(true);
    setMessage({ type: '', text: '' });
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      if (!newPassword) {
        setMessage({ type: 'error', text: 'Password is required' });
        return;
      }

      if (newPassword.length < 6) {
        setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
        return;
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        setMessage({ type: 'error', text: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
        return;
      }

      setLoading(true);
      const response = await fetch(`${apiUrl}/api/auth/admin/users/${resetPasswordUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authUtils.getAuthHeader()
        },
        body: JSON.stringify({ newPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setMessage({ type: 'success', text: 'Password reset successfully!' });
      setShowResetPasswordModal(false);
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchLoginActivity = async (userId = null, append = false) => {
    try {
      if (append) setActivityLoadingMore(true); else setActivityLoading(true);
      const offset = append ? loginActivity.length : 0;
      const base = userId
        ? `${apiUrl}/api/auth/admin/login-activity/${userId}`
        : `${apiUrl}/api/auth/admin/login-activity`;
      const response = await fetch(`${base}?limit=${ACTIVITY_PAGE_SIZE}&offset=${offset}`, {
        headers: authUtils.getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to load login activity');
      const result = await response.json();
      const rows = Array.isArray(result) ? result : (result.data || []);
      setActivityTotal(Array.isArray(result) ? rows.length : (result.total || 0));
      setLoginActivity(append ? [...loginActivity, ...rows] : rows);
    } catch (error) {
      console.error('Error loading login activity:', error);
      if (!append) setLoginActivity([]);
    } finally {
      setActivityLoading(false);
      setActivityLoadingMore(false);
    }
  };

  const handleToggleLoginActivity = () => {
    if (!showLoginActivity) {
      setActivityUserId(null);
      fetchLoginActivity(null);
    }
    setShowLoginActivity(!showLoginActivity);
  };

  const handleActivityFilterChange = (userId) => {
    const val = userId === '' ? null : userId;
    setActivityUserId(val);
    fetchLoginActivity(val);
  };

  const handlePerUserActivity = (userId) => {
    setActivityUserId(userId);
    setShowLoginActivity(true);
    fetchLoginActivity(userId);
  };

  // Detect concurrent sessions: same user logged in from 2+ IPs in last 30 min
  const getConcurrentSessionUsers = () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentSuccessful = loginActivity.filter(
      (a) => a.success && new Date(a.timestamp || a.createdAt) >= thirtyMinAgo
    );
    const userIpMap = {};
    recentSuccessful.forEach((a) => {
      const uid = a.userId || a.user_id || a.username;
      if (!userIpMap[uid]) userIpMap[uid] = new Set();
      if (a.ipAddress || a.ip_address) userIpMap[uid].add(a.ipAddress || a.ip_address);
    });
    const flagged = new Set();
    Object.entries(userIpMap).forEach(([uid, ips]) => {
      if (ips.size >= 2) flagged.add(uid);
    });
    return flagged;
  };

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <div className="brand-strip" />
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div className="page-header">
          <h2>User Management</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleToggleLoginActivity}
            style={{
              padding: '10px 20px',
              backgroundColor: showLoginActivity ? 'var(--text-500)' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
            onMouseLeave={(e) => e.target.style.backgroundColor = showLoginActivity ? 'var(--text-500)' : '#6b7280'}
          >
            {showLoginActivity ? '✕ Close Activity' : 'Login Activity'}
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-600)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--accent)'}
          >
            {showCreateForm ? '✕ Cancel' : '+ Create New User'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '20px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          color: message.type === 'success' ? '#155724' : '#721c24',
          fontSize: '14px'
        }}>
          {message.text}
        </div>
      )}

      {/* Create User Form */}
      {showCreateForm && (
        <div className="dash-panel" style={{
          padding: '24px',
          marginBottom: '2rem',
          border: '1px solid var(--border)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            color: 'var(--text-900)'
          }}>
            Create New User
          </h2>
          <form onSubmit={handleCreateUser}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  Username *
                </label>
                <input
                  type="text"
                  name="username"
                  value={newUser.username}
                  onChange={handleInputChange}
                  disabled={loading}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  placeholder="Enter username"
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={newUser.email}
                  onChange={handleInputChange}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={newUser.password}
                    onChange={handleInputChange}
                    disabled={loading}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingRight: '45px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    placeholder="Min 6 chars, upper + lower + number"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      fontSize: '18px',
                      color: 'var(--text-500)',
                      lineHeight: '1'
                    }}
                    tabIndex="-1"
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={newUser.fullName}
                  onChange={handleInputChange}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  Role *
                </label>
                <select
                  name="role"
                  value={newUser.role}
                  onChange={handleInputChange}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: loading ? '#9ca3af' : 'var(--success)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      )}

      {/* Login Activity Panel */}
      {showLoginActivity && (
        <div className="dash-panel" style={{
          padding: '24px',
          marginBottom: '2rem',
          border: '1px solid var(--border)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '20px',
              color: 'var(--text-900)'
            }}>
              Login Activity
            </h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <select
                value={activityUserId || ''}
                onChange={(e) => handleActivityFilterChange(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '2px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'white',
                  minWidth: '180px'
                }}
              >
                <option value="">All Users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
              <button
                onClick={() => setShowLoginActivity(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>

          {activityLoading ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-500)'
            }}>
              Loading activity...
            </div>
          ) : loginActivity.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-500)'
            }}>
              No login activity found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'var(--surface-2)',
                    borderBottom: '2px solid var(--border)'
                  }}>
                    {['Date/Time', 'Username', 'IP Address', 'Device', 'Status'].map((col) => (
                      <th key={col} style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--text-900)'
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const concurrentUsers = getConcurrentSessionUsers();
                    return loginActivity.map((entry, idx) => {
                      const success = entry.success !== false;
                      const timestamp = entry.timestamp || entry.createdAt || entry.created_at;
                      const username = entry.username || entry.user?.username || '-';
                      const ip = entry.ipAddress || entry.ip_address || '-';
                      const ua = entry.userAgent || entry.user_agent || '';
                      const userId = entry.userId || entry.user_id;
                      const isConcurrent = concurrentUsers.has(userId) || concurrentUsers.has(username);

                      return (
                        <tr
                          key={entry.id || idx}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: !success ? 'rgba(220, 38, 38, 0.06)' : 'transparent'
                          }}
                        >
                          <td style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'var(--text-900)',
                            whiteSpace: 'nowrap'
                          }}>
                            {timestamp ? new Date(timestamp).toLocaleString() : '-'}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'var(--text-900)',
                            fontWeight: '500'
                          }}>
                            {username}
                            {isConcurrent && success && (
                              <span
                                title="Concurrent sessions detected (2+ IPs in last 30 min)"
                                style={{
                                  display: 'inline-block',
                                  marginLeft: '8px',
                                  padding: '2px 6px',
                                  borderRadius: '8px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  backgroundColor: '#fbbf24',
                                  color: '#78350f'
                                }}
                              >
                                MULTI-IP
                              </span>
                            )}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'var(--text-500)',
                            fontFamily: 'monospace'
                          }}>
                            {ip}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'var(--text-500)'
                          }}>
                            {parseUserAgent(ua)}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            fontSize: '13px'
                          }}>
                            <span style={{
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: success ? '#d4edda' : '#f8d7da',
                              color: success ? '#155724' : '#721c24'
                            }}>
                              {success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              {loginActivity.length < activityTotal && (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <button
                    onClick={() => fetchLoginActivity(activityUserId, true)}
                    disabled={activityLoadingMore}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: activityLoadingMore ? 'not-allowed' : 'pointer',
                      opacity: activityLoadingMore ? 0.6 : 1
                    }}
                  >
                    {activityLoadingMore ? 'Loading...' : `Load More (${loginActivity.length} of ${activityTotal})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Users List */}
      <div className="dash-panel" style={{
        padding: 0,
        overflow: 'hidden',
        border: '1px solid var(--border)'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse'
        }}>
          <thead>
            <tr style={{
              backgroundColor: 'var(--surface-2)',
              borderBottom: '2px solid var(--border)'
            }}>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Username
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Email
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Full Name
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Role
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Status
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Created
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-900)'
              }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan="7" style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-500)'
                }}>
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="7" style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-500)'
                }}>
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: 'var(--text-900)',
                    fontWeight: '500'
                  }}>
                    {user.username}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: 'var(--text-500)'
                  }}>
                    {user.email || '-'}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: 'var(--text-500)'
                  }}>
                    {user.fullName || '-'}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px'
                  }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      backgroundColor: user.role === 'admin' ? 'var(--info)' : 'var(--success)',
                      color: 'white'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px'
                  }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: user.isActive ? '#d4edda' : '#f8d7da',
                      color: user.isActive ? '#155724' : '#721c24'
                    }}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: 'var(--text-500)'
                  }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{
                    padding: '16px',
                    textAlign: 'center'
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'center'
                    }}>
                      <button
                        onClick={() => handleEditClick(user)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--info)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--info)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--info)'}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetPasswordClick(user)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--warning)',
                          color: 'var(--text-900)',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--warning)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--warning)'}
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handlePerUserActivity(user.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
                      >
                        Activity
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              fontSize: '20px',
              color: 'var(--text-900)'
            }}>
              Edit User
            </h2>
            <form onSubmit={handleUpdateUser}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-900)'
                  }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={editingUser.username}
                    onChange={handleEditInputChange}
                    disabled={loading}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-900)'
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={editingUser.email}
                    onChange={handleEditInputChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-900)'
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={editingUser.fullName}
                    onChange={handleEditInputChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-900)'
                  }}>
                    Role *
                  </label>
                  <select
                    name="role"
                    value={editingUser.role}
                    onChange={handleEditInputChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-900)'
                  }}>
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={editingUser.isActive}
                      onChange={handleEditInputChange}
                      disabled={loading}
                      style={{
                        marginRight: '8px',
                        cursor: 'pointer'
                      }}
                    />
                    Active
                  </label>
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--text-500)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: loading ? '#9ca3af' : 'var(--success)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && resetPasswordUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              fontSize: '20px',
              color: 'var(--text-900)'
            }}>
              Reset Password for {resetPasswordUser.username}
            </h2>
            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-900)'
                }}>
                  New Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingRight: '45px',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    placeholder="Min 6 chars, upper + lower + number"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      fontSize: '18px',
                      color: 'var(--text-500)',
                      lineHeight: '1'
                    }}
                    tabIndex="-1"
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPasswordUser(null);
                    setNewPassword('');
                  }}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--text-500)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: loading ? '#9ca3af' : 'var(--warning)',
                    color: loading ? 'white' : 'var(--text-900)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
