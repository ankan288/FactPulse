'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarIndicator,
  AvatarStatus,
} from '@/components/ui/Avatar';

interface ProfileDropdownProps {
  username?: string;
  email?: string;
  avatarUrl?: string;
  status?: 'online' | 'offline' | 'busy' | 'away';
}


export default function ProfileDropdown({
  username = 'User',
  email = 'user@example.com',
  avatarUrl,
  status = 'online',
}: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    router.push('/signin');
    setIsOpen(false);
  };

  // Get initials for fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', zIndex: 1000 }}>
      {/* Profile Button - WITH VISIBLE STYLING */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        style={{
          padding: '3px',
          border: '1px solid rgba(168,85,247,0.3)',
          background: 'rgba(168,85,247,0.05)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '100%',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(168,85,247,0.1)',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.style.borderColor = 'rgba(168,85,247,0.6)';
          btn.style.background = 'rgba(168,85,247,0.15)';
          btn.style.boxShadow = '0 4px 12px rgba(168,85,247,0.3)';
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.style.borderColor = 'rgba(168,85,247,0.3)';
          btn.style.background = 'rgba(168,85,247,0.05)';
          btn.style.boxShadow = '0 2px 8px rgba(168,85,247,0.1)';
        }}
        title={`${username} (${status})`}
      >
        <Avatar
          style={{
            width: '32px',
            height: '32px',
            borderWidth: '1px',
            borderColor: 'rgba(168,85,247,0.4)',
            fontSize: '14px',
          }}
        >
          <AvatarImage src={avatarUrl || '/user.png'} alt={username} />
          <AvatarFallback>{getInitials(username)}</AvatarFallback>
          <AvatarIndicator>
            <AvatarStatus variant={status} />
          </AvatarIndicator>
        </Avatar>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 12,
              width: 280,
              background:
                'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(20,28,48,0.95) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: 12,
              boxShadow:
                '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.3)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
          >
            {/* User Info Section */}
            <div
              style={{
                padding: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              {/* Mini Avatar in Dropdown */}
              <Avatar
                style={{
                  width: '48px',
                  height: '48px',
                  borderWidth: '2px',
                  borderColor: 'rgba(168,85,247,0.4)',
                }}
              >
                <AvatarImage src={avatarUrl || '/user.png'} alt={username} />
                <AvatarFallback>{getInitials(username)}</AvatarFallback>
              </Avatar>

              {/* User Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f0f4f8',
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {username}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(240,244,248,0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email}
                </div>
                {/* Status Badge */}
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor:
                        status === 'online'
                          ? '#22c55e'
                          : status === 'busy'
                            ? '#eab308'
                            : status === 'away'
                              ? '#3b82f6'
                              : '#71717a',
                    }}
                  />
                  <span
                    style={{
                      color: 'rgba(240,244,248,0.7)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {status}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div style={{ padding: '8px 0' }}>
              {/* Profile Option */}
              <button
                onClick={() => {
                  router.push('/dashboard');
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(240,244,248,0.8)',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                  e.currentTarget.style.color = '#f0f4f8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(240,244,248,0.8)';
                }}
              >
                <span style={{ fontSize: 16 }}>👤</span>
                <span>View Profile</span>
              </button>

              {/* History Option */}
              <button
                onClick={() => {
                  router.push('/history');
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(240,244,248,0.8)',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                  e.currentTarget.style.color = '#f0f4f8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(240,244,248,0.8)';
                }}
              >
                <span style={{ fontSize: 16 }}>📜</span>
                <span>Verification History</span>
              </button>

              {/* Settings Option */}
              <button
                onClick={() => {
                  router.push('/settings');
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(240,244,248,0.8)',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                  e.currentTarget.style.color = '#f0f4f8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(240,244,248,0.8)';
                }}
              >
                <span style={{ fontSize: 16 }}>⚙️</span>
                <span>Settings</span>
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />

            {/* Logout Option */}
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                color: 'rgba(244,63,94,0.8)',
                fontSize: 14,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244,63,94,0.1)';
                e.currentTarget.style.color = '#f87171';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(244,63,94,0.8)';
              }}
            >
              <span style={{ fontSize: 16 }}>🚪</span>
              <span>Log Out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
