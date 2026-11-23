import React from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

/**
 * ReactBits ShinyText: Metallic specular sheen sweeping across ceremonial badges and labels.
 */
export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 4,
  className = '',
}) => {
  return (
    <span
      className={`inline-block bg-clip-text ${disabled ? 'text-[#F7D160]' : 'rb-shiny-text'} ${className}`}
      style={
        disabled
          ? undefined
          : ({
              '--rb-shine-speed': `${speed}s`,
            } as React.CSSProperties)
      }
    >
      {text}
    </span>
  );
};
