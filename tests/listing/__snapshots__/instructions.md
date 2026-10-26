Sequentum MCP server: manages Sequentum web-data extraction agents and their runs, run output files and run diagnostics, agent schedules, spaces (folders of agents), credits (balance, history and spending reports), and builds new agents from a natural-language prompt with Agent Builder.

SUFFICIENCY POLICY — applies to all build and run requests:
Before invoking any tool that builds or runs an agent in response to a scrape or automation request, you MUST ensure the following are unambiguous: (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.).

You MAY resolve missing details from explicit conversational context when the context makes the answer clearly unambiguous.

You MUST NOT silently extrapolate by analogy. This includes copying details from one site onto a different site, or reusing a prior request's data schema for a conceptually different request — even when prior inferences were accepted.

When the request is genuinely underspecified, you MUST ask one consolidated clarifying question covering all gaps before any tool call — ask everything you need in one round-trip, not sequentially. When you would need to extrapolate by analogy, you MUST state your inference in one short line and ask the user to confirm before any tool call.
