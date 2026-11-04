export default function RootLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page content"
      className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9FF] text-[#1E1B4B]"
    >
      <div className="flex flex-col items-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-[#8B5CF6] opacity-25" />
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#5B21B6] border-t-transparent" />
          <span className="text-xs font-bold text-[#5B21B6]">DH</span>
        </div>
        <h2 className="mt-4 font-serif text-lg font-semibold tracking-wide text-stone-800">
          Dharohar
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Loading cultural archives &amp; map data...
        </p>
      </div>
    </div>
  );
}
