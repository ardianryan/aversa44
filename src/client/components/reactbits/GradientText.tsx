import React from 'react';

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
  disabled?: boolean;
}

/**
 * ReactBits GradientText: Flowing molten gold & champagne animated gradient typography.
 */
export const GradientText: React.FC<GradientTextProps> = ({
  children,
  className = '',
  colors = ['#FDF39D', '#F5C538', '#E09D17', '#F7D160', '#FDF39D'],
  animationSpeed = 6,
  showBorder = false,
  disabled = false,
}) => {
  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
    backgroundSize: '300% 100%',
    animation: disabled ? 'none' : `rbGradientFlow ${animationSpeed}s linear infinite`,
  };

  if (showBorder) {
    return (
      <span
        className={`relative inline-flex items-center justify-center rounded-xl p-[1.5px] ${className}`}
        style={gradientStyle}
      >
        <span className="relative z-10 rounded-[10px] bg-[#1A021D] px-3 py-1">
          <span className="bg-clip-text text-transparent font-extrabold" style={gradientStyle}>
            {children}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-block bg-clip-text text-transparent ${className}`} style={gradientStyle}>
      {children}
    </span>
  );
};
