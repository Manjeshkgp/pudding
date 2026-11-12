// PayPal logo used on the connect, top-up and approval screens.
// The artwork is the supplied file in public/images/paypal-logo.svg.
export default function PaypalMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/paypal-logo.svg"
      alt=""
      className={`shrink-0 rounded-full ${className ?? ""}`}
    />
  );
}
