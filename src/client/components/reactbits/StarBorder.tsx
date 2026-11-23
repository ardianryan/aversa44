import React from 'react';

interface StarBorderProps {
  children: React.ReactNode;
  className?: string;
  color?: string;
  speed?: string;
  disabled?: boolean;
}

/**
 * ReactBits StarBorder: Animated golden light sweep orbiting high-priority action wrappers.
 */
export const StarBorder: React.FC<StarBorderProps> = ({
  children,
  className = '',
  color = '#F5C538',
  speed = '5s',
  disabled = false,
}) => {
  return (
    <div className={`relative inline-block overflow-hidden rounded-xl p-[1.5px] ${className}`}>
      {!disabled && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-[250%] h-[55%] opacity-75 bottom-[-12px] right-[-200%] rounded-full rb-star-bottom"
            style={{
              background: `radial-gradient(circle, ${color}, transparent 25%)`,
              animationDuration: speed,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-[250%] h-[55%] opacity-75 top-[-12px] left-[-200%] rounded-full rb-star-top"
            style={{
              background: `radial-gradient(circle, #FDF39D, transparent 25%)`,
              animationDuration: speed,
            }}
          />
        </>
      )}
      <div className="relative z-10 rounded-[11px]">{children}</div>
    </div>
  );
};
