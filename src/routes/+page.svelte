<script lang="ts">
  import "deep-chat";
  import "#lib/lake-county.css";
</script>

<header class="masthead">
  <p class="masthead__wordmark">Lake County, Illinois</p>
  <p class="masthead__page">Contract Investigation</p>
</header>

<main>
  <section class="hero">
    <h1 class="hero__title">Contract Investigation</h1>
    <p class="hero__lede">
      Ask questions about a contract and get plain-language answers, with the
      clauses behind them.
    </p>
  </section>

  <section class="about" aria-labelledby="about-heading">
    <h2 class="about__heading" id="about-heading">What this tool does</h2>
    <p>
      Contract Investigation reads the contract documents you give it and
      answers questions about them. Ask about terms, dates, obligations, or
      risks in everyday language, and the assistant replies with what the
      documents say. The assistant answers through this site's own API, using a
      hosted language model.
    </p>
  </section>
</main>

<aside class="assistant" aria-labelledby="assistant-heading">
  <p class="assistant__bar" id="assistant-heading">Contract Assistant</p>
  <!-- maxMessages 0 sends the full history, so follow-ups keep context. -->
  <deep-chat
    id="chat"
    class="assistant__chat"
    chatStyle={{
      fontFamily: 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif',
      border: "none",
      borderRadius: "0",
      backgroundColor: "#ffffff",
    }}
    inputAreaStyle={{
      backgroundColor: "#ffffff",
      borderTop: "1px solid #d6e3ef",
    }}
    textInput={{
      styles: {
        container: { backgroundColor: "#f4f8fc", borderRadius: "6px" },
        text: { color: "#1a2b3c" },
      },
      placeholder: {
        text: "Ask about a contract...",
        style: { color: "#5b6b7a" },
      },
    }}
    submitButtonStyles={{
      submit: {
        container: {
          default: { backgroundColor: "#0073BB" },
          hover: { backgroundColor: "#00568C" },
        },
      },
    }}
    messageStyles={{
      default: {
        user: { bubble: { backgroundColor: "#0073BB", color: "#ffffff" } },
        ai: { bubble: { backgroundColor: "#eef4fa", color: "#1a2b3c" } },
      },
    }}
    connect={{ url: "/api/chat", stream: true }}
    requestBodyLimits={{ maxMessages: 0 }}
    introMessage={{
      text: "Ask me anything. I am the Contract Investigation assistant.",
    }}
  ></deep-chat>
</aside>
