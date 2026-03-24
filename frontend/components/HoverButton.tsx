import React, { useRef, useState, MouseEvent, ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  glowColor?: string;
  backgroundColor?: string;
  textColor?: string;
  hoverTextColor?: string;
}

const HoverButton: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  className = '', 
  disabled = false,
  glowColor = '#00ffc3',
  backgroundColor = '#111827', // gray-900 equivalent
  textColor = '#ffffff',
  hoverTextColor = '#67e8f9' // cyan-300 equivalent
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setGlowPosition({ x, y });
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: '16px 32px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        transition: 'color 300ms ease, background-color 300ms ease',
        fontSize: '15px',
        fontWeight: 600,
        borderRadius: '12px',
        zIndex: 10,
        fontFamily: "'Inter', sans-serif",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: backgroundColor,
        color: isHovered ? hoverTextColor : textColor,
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      }}
    >
      {/* Glow effect div */}
      <div
        style={{
          position: 'absolute',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          opacity: 0.5,
          pointerEvents: 'none',
          transition: 'transform 400ms cubic-bezier(0, 0, 0.2, 1)',
          transform: `translate(-50%, -50%) scale(${isHovered ? 1.2 : 0})`,
          left: `${glowPosition.x}px`,
          top: `${glowPosition.y}px`,
          background: `radial-gradient(circle, ${glowColor} 10%, transparent 70%)`,
          zIndex: 0,
        }}
      />
      
      {/* Button content */}
      <span style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
        {children}
      </span>
    </button>
  );
};

export { HoverButton }
