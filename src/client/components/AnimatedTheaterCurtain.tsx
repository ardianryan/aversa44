import React, { useEffect, useState } from 'react';

interface AnimatedTheaterCurtainProps {
  paused?: boolean;
  curtainsClosed?: boolean;
}

/**
 * Rebuilt Multi-Layer Animated Velvet Theater Curtain System.
 * - Top gold pelmet rod + compact scalloped valance anchored flush at top:0 (never overlaps hero copy).
 * - Animated left & right stage wing drapes sweep open from center on mount and respond to scroll parallax.
 */
export const AnimatedTheaterCurtain: React.FC<AnimatedTheaterCurtainProps> = ({
  paused = false,
  curtainsClosed = false,
}) => {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpened(true), 120);
    return () => clearTimeout(timer);
  }, []);

  const isOpen = opened && !curtainsClosed;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {/* Top Carved Gold Rod */}
      <div
        className="absolute z-20 top-0 inset-x-0 h-2.5 sm:h-3 shadow-[0_3px_12px_rgba(0,0,0,0.65)]"
        style={{
          background:
            'linear-gradient(180deg, #FDF39D 0%, #F5C538 35%, #B6580B 78%, #5D2904 100%)',
        }}
      />

      {/* Compact Top Scalloped Velvet Valance (strictly contained to top edge) */}
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className={`absolute z-20 top-2 left-0 w-full h-14 sm:h-20 lg:h-24 drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)] ${
          paused ? '' : 'curtain-tassel-swing'
        }`}
      >
        <defs>
          <linearGradient id="velvetSwag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A042E" />
            <stop offset="45%" stopColor="#7D1B05" />
            <stop offset="85%" stopColor="#5C0933" />
            <stop offset="100%" stopColor="#310603" />
          </linearGradient>
          <linearGradient id="goldTrim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#B6580B" />
            <stop offset="30%" stopColor="#F5C538" />
            <stop offset="50%" stopColor="#FDF39D" />
            <stop offset="75%" stopColor="#E09D17" />
            <stop offset="100%" stopColor="#B6580B" />
          </linearGradient>
        </defs>

        {/* 5 Balanced Scalloped Valance Swags across full width */}
        <path
          d="M0,0 L1440,0 L1440,42 Q1296,105 1152,38 Q1008,108 864,38 Q720,108 576,38 Q432,108 288,38 Q144,105 0,42 Z"
          fill="url(#velvetSwag)"
        />
        {/* Inner Pleat Shading Lines */}
        <path
          d="M20,0 Q144,82 268,0 M308,0 Q432,85 556,0 M596,0 Q720,85 844,0 M884,0 Q1008,85 1132,0 M1172,0 Q1296,82 1420,0"
          fill="none"
          stroke="#9D1B68"
          strokeWidth="2.5"
          strokeOpacity="0.45"
        />
        {/* Golden Bullion Trim along bottom scallop */}
        <path
          d="M0,42 Q144,105 288,38 Q432,108 576,38 Q720,108 864,38 Q1008,108 1152,38 Q1296,105 1440,42"
          fill="none"
          stroke="url(#goldTrim)"
          strokeWidth="5"
        />
        {/* Gold Knot Rosettes at Swag Joints */}
        {[288, 576, 864, 1152].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={38} r="8" fill="#F5C538" stroke="#310603" strokeWidth="2" />
            <circle cx={cx} cy={38} r="3" fill="#FDF39D" />
          </g>
        ))}
      </svg>

      {/* Left Animated Velvet Wing Curtain (frames left margin, sweeps open on mount & scroll) */}
      <div
        className="absolute z-10 top-2 bottom-0 left-0 w-1/2 transition-transform duration-[1350ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transform: isOpen
            ? 'translate3d(calc(-100% + clamp(14px, 5vw, 96px)), 0, 0)'
            : 'translate3d(0, 0, 0)',
          transformOrigin: 'left center',
        }}
      >
        <div
          className={`w-full h-full relative ${paused || !isOpen ? '' : 'curtain-velvet-sway'}`}
          style={{
            background:
              'repeating-linear-gradient(90deg, #310603 0px, #680938 14px, #8E1248 24px, #4A042E 36px)',
            borderRight: '3px solid #E09D17',
            borderBottomRightRadius: '48px',
            boxShadow: '12px 0 32px rgba(0, 0, 0, 0.65)',
          }}
        >
          {/* Gold Rope Tie-back Accent */}
          <div
            className={`absolute top-[52%] left-0 right-0 h-2 rounded-r-full transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            style={{
              background: 'linear-gradient(90deg, #B6580B, #FDF39D, #E09D17)',
            }}
          />
        </div>
      </div>

      {/* Right Animated Velvet Wing Curtain (frames right margin, sweeps open on mount & scroll) */}
      <div
        className="absolute z-10 top-2 bottom-0 right-0 w-1/2 transition-transform duration-[1350ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transform: isOpen
            ? 'translate3d(calc(100% - clamp(14px, 5vw, 96px)), 0, 0)'
            : 'translate3d(0, 0, 0)',
          transformOrigin: 'right center',
        }}
      >
        <div
          className={`w-full h-full relative ${paused || !isOpen ? '' : 'curtain-velvet-sway'}`}
          style={{
            background:
              'repeating-linear-gradient(90deg, #4A042E 0px, #8E1248 12px, #680938 22px, #310603 36px)',
            borderLeft: '3px solid #E09D17',
            borderBottomLeftRadius: '48px',
            boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.65)',
          }}
        >
          {/* Gold Rope Tie-back Accent */}
          <div
            className={`absolute top-[52%] left-0 right-0 h-2 rounded-l-full transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            style={{
              background: 'linear-gradient(90deg, #E09D17, #FDF39D, #B6580B)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
