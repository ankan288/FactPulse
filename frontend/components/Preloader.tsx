'use client';

import { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';

const words = ['Hello', 'Bonjour', 'Ciao', 'Olà', 'やあ', 'Hallå', 'Guten tag', 'হ্যালো'];

const opacity: Variants = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 0.75,
    transition: { duration: 1, delay: 0.2 },
  },
};
const slideUp: Variants = {
  initial: {
    top: 0,
  },
  exit: {
    top: '-100vh',
    transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 },
  },
};

interface PreloaderProps {
  onComplete?: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
  const [index, setIndex] = useState(0);
  const [dimension, setDimension] = useState({ width: 0, height: 0 });
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setDimension({ width: window.innerWidth, height: window.innerHeight });
  }, []);

  useEffect(() => {
    if (index === words.length - 1) {
      // Start exit animation after showing the last word
      setTimeout(() => {
        setIsExiting(true);
        // Call onComplete after exit animation
        setTimeout(() => {
          onComplete?.();
        }, 1000);
      }, 1000);
      return;
    }

    setTimeout(
      () => {
        setIndex(index + 1);
      },
      index === 0 ? 1000 : 150,
    );
  }, [index, onComplete]);

  const initialPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height + 300} 0 ${dimension.height} L0 0`;
  const targetPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height} 0 ${dimension.height} L0 0`;

  const curve: Variants = {
    initial: {
      d: initialPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] },
    },
    exit: {
      d: targetPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.3 },
    },
  };

  return (
    <motion.div
      variants={slideUp}
      initial="initial"
      animate={isExiting ? 'exit' : 'initial'}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#070b13',
        zIndex: 999999999,
      }}
    >
      {dimension.width > 0 && (
        <>
          <motion.p
            variants={opacity}
            initial="initial"
            animate="enter"
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'white',
              fontSize: 'clamp(2rem, 5vw, 3.75rem)',
              position: 'absolute',
              zIndex: 10,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                display: 'block',
                width: '10px',
                height: '10px',
                backgroundColor: 'white',
                borderRadius: '50%',
                marginRight: '10px',
              }}
            ></span>
            {words[index]}
          </motion.p>
          <svg
            style={{
              position: 'absolute',
              top: 0,
              width: '100%',
              height: 'calc(100% + 300px)',
            }}
          >
            <motion.path
              variants={curve}
              initial="initial"
              animate={isExiting ? 'exit' : 'initial'}
              fill="#070b13"
            />
          </svg>
        </>
      )}
    </motion.div>
  );
}
