// PayPal circle used on the connect screens. Drawn in code, sample artwork.
export default function PaypalMark({ className }: { className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0e32a0] ${className ?? ""}`}
    >
      <svg viewBox="0 0 50 60" className="h-[52%] w-[42%]" aria-hidden="true">
        <path
          fillRule="evenodd"
          fill="#a9b9ee"
          d="M10 0H28C38 0 43 6 41 15C39 25 31 30 21 30H17L13 52H0Z M19 11L17 21H22C26 21 29 18 29.5 15C30 12 28 11 25 11Z"
        />
        <path
          fillRule="evenodd"
          fill="#fff"
          d="M18 8H36C46 8 51 14 49 23C47 33 39 38 29 38H25L21 60H8Z M27 19L25 29H30C34 29 37 26 37.5 23C38 20 36 19 33 19Z"
        />
      </svg>
    </span>
  );
}
