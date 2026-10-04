"use client";

// Replaces the whole page when even the app's frame fails to load, so it can't use the app's styles.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.25rem", textAlign: "center", color: "#17201c", background: "#f6f7f5" }}>
        <title>Something went wrong · Physio Sessions</title>
        {/* No app frame here (so no language setting): say it in both languages. */}
        <h1 style={{ fontSize: "1.4rem" }}>Something went wrong · कुछ गड़बड़ हो गई</h1>
        <p style={{ color: "#5b6660" }}>Usually this is a weak signal. Nothing you saved earlier is lost.</p>
        <p style={{ color: "#5b6660" }} lang="hi">
          अक्सर यह कमज़ोर सिग्नल की वजह से होता है। पहले सेव किया हुआ कुछ भी नहीं खोया है।
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.8rem 1.6rem", fontSize: "1rem", borderRadius: "0.75rem", border: 0, background: "#0f766e", color: "white" }}
        >
          Try again · दोबारा कोशिश करें
        </button>
      </body>
    </html>
  );
}
