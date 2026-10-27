import Image from "next/image";

export function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/tcf-logo.png"
      alt="The Citizens Foundation logo"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
      priority
    />
  );
}
