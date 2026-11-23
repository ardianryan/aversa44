import React from 'react';

interface AuroraBackgroundProps {
  paused?: boolean;
}

/**
 * ReactBits Aurora Background: Theatrical Imperial Plum, Crimson & Royal Gold ambient stage wash.
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ paused = false }) => {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`absolute -top-32 left-1/4 w-[65vw] max-w-[780px] h-[420px] rounded-full blur-[95px] opacity-35 bg-[radial-gradient(circle,#9D1B68_0%,#7D1B05_45%,transparent_75%)] ${
          paused ? '' : 'rb-aurora-drift-a'
        }`}
      />
      <div
        className={`absolute top-1/3 right-[-10%] w-[50vw] max-w-[640px] h-[420px] rounded-full blur-[110px] opacity-25 bg-[radial-gradient(circle,#F5C538_0%,#B6580B_45%,transparent_75%)] ${
          paused ? '' : 'rb-aurora-drift-b'
        }`}
      />
    </div>
  );
};
