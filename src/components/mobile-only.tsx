import CryingCat from "@/components/crying-cat";

export default function MobileOnly() {
  return (
    <div className="fixed inset-0 z-50 hidden flex-col items-center justify-center bg-white px-6 text-black desktop:flex">
      <CryingCat />

      <div className="mt-[23px] flex w-full max-w-[576px] flex-col items-start gap-6 text-center">
        <h1
          className={`font-display w-full text-[36px] font-bold leading-[44px] tracking-[-0.54px]`}
        >
          Sorry, we&apos;re currently available on mobile only.
        </h1>
        <p className="w-full font-sans text-[17px] leading-[25px] tracking-[-0.17px]">
          Please don&apos;t leave just yet! Open this website on your phone to
          continue exploring.
        </p>
      </div>
    </div>
  );
}
