export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="max-w-xl space-y-4 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Music Suite</p>
        <h1 className="text-4xl font-semibold">Page not found</h1>
        <p className="text-base text-muted-foreground">
          The page you requested does not exist in this workspace.
        </p>
      </div>
    </main>
  );
}
