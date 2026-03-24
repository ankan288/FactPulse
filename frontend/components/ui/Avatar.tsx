'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const avatarStatusVariants = cva('flex items-center rounded-full size-2 border-2 border-background', {
  variants: {
    variant: {
      online: 'bg-green-600',
      offline: 'bg-zinc-600 dark:bg-zinc-300',
      busy: 'bg-yellow-600',
      away: 'bg-blue-600',
    },
  },
  defaultVariants: {
    variant: 'online',
  },
});

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="avatar"
      style={{
        position: 'relative',
        display: 'flex',
        flexShrink: 0,
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        ...style,
      }}
      className={cn('relative flex shrink-0 size-10 rounded-full', className)}
      {...props}
    />
  )
);
Avatar.displayName = 'Avatar';

interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, style, ...props }, ref) => (
    <img
      ref={ref}
      data-slot="avatar-image"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '50%',
        zIndex: 10,
        ...style,
      }}
      className={cn('absolute inset-0 aspect-square h-full w-full object-cover rounded-full z-10', className)}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="avatar-fallback"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '1px solid rgba(216,180,254,0.3)',
        background: 'linear-gradient(to bottom right, rgba(168,85,247,0.2), rgba(147,51,234,0.2))',
        color: '#c084fc',
        fontSize: '0.75rem',
        fontWeight: 600,
        zIndex: 0,
        ...style,
      }}
      className={cn(
        'absolute inset-0 flex h-full w-full items-center justify-center rounded-full border border-purple-300 bg-gradient-to-br from-purple-500/20 to-purple-600/20 text-purple-400 text-xs font-semibold z-0',
        className
      )}
      {...props}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

interface AvatarIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const AvatarIndicator = React.forwardRef<HTMLDivElement, AvatarIndicatorProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="avatar-indicator"
      style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        zIndex: 20,
        ...style,
      }}
      className={cn('absolute flex size-4 items-center justify-center bottom-0 right-0', className)}
      {...props}
    />
  )
);
AvatarIndicator.displayName = 'AvatarIndicator';

interface AvatarStatusProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarStatusVariants> {
  className?: string;
}

const AvatarStatus = React.forwardRef<HTMLDivElement, AvatarStatusProps>(
  ({ className, variant, style, ...props }, ref) => {
    let bgColor = '#22c55e'; // online
    if (variant === 'offline') bgColor = '#52525b';
    if (variant === 'busy') bgColor = '#ca8a04';
    if (variant === 'away') bgColor = '#2563eb';

    return (
      <div
        ref={ref}
        data-slot="avatar-status"
        style={{
          display: 'flex',
          alignItems: 'center',
          borderRadius: '50%',
          width: '10px',
          height: '10px',
          border: '2px solid var(--bg-deep, #050d1a)',
          backgroundColor: bgColor,
          ...style,
        }}
        className={cn(avatarStatusVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
AvatarStatus.displayName = 'AvatarStatus';

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarIndicator,
  AvatarStatus,
  avatarStatusVariants,
};
