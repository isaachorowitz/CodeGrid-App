code: "WB2"
name: "Website Builder V2"
description: "Award-caliber multi-model website builder that adapts its design philosophy, animation stack, and visual language to the type of site being built — from conversion-focused SaaS pages to immersive creative portfolios. Uses Gemini 3.1 Pro for design enhancement, AI image generation via Zippy CDN, full SEO, performance, and a final human-level audit pass."
version: "4.1.0"
model: "claude-sonnet-4-6"

# Git checkpoint: initialize a private GitHub-backed repo before the coding phase and
# save local checkpoints after each implementation step. With final_only push strategy,
# the remote push is enforced at the end of the workflow rather than after every step.
# Activation threshold is step index 7 (the 8th step, Plan Architecture).
# Steps 0-6 stay read-only and only produce planning outputs in the DB.
# The repo is typically initialized before scaffolding begins so code generated in later
# steps always has checkpoint protection.
git_checkpoint: true
git_checkpoint_after_step: 7
git_checkpoint_require_remote_push: true
git_checkpoint_push_strategy: "final_only"
greeting: "What kind of website are you building? Tell me about the project and I'll design something exceptional."

inputs:
  - key: "documents"
    label: "Reference Files"
    type: "file"
    required: false
    accept: ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.svg"
    placeholder: "Upload brand guidelines, wireframes, reference docs..."

tools: []

ask_questions_first: true

allowed_sdk_tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Bash"
  - "Glob"
  - "Grep"
  - "mcp__exa-search__web_search_exa"
  - "mcp__exa-search__company_research_exa"
  - "mcp__exa-search__get_code_context_exa"
  - "mcp__github__*"
  - "mcp__gemini-tools__generate_content"
  - "mcp__gemini-tools__rewrite_component"
  - "mcp__gemini-tools__generate_image"
  - "mcp__gemini-tools__generate_and_upload_image"
  - "mcp__zippy-tools__upload_base64"
  - "mcp__zippy-tools__upload_url"

steps:
  # ═══════════════════════════════════════════════════════════════════════
  # STEP 0: Research & Plan (Opus 4.6 — deeper reasoning, uses Exa search)
  # Runs BEFORE questions so Discovery can ask smarter, research-informed Q's.
  # Makes a preliminary tech stack decision; Discovery confirms via user answers.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Research & Plan"
    model: "claude-opus-4-6"
    max_budget_usd: 5
    max_turns: 12
    prompt_template: |
      You are about to build a premium website. Before asking the user any questions,
      do thorough research so the Discovery step can ask smart, informed questions.

      User request: {{user_prompt}}

      {{#if uploaded_files}}The user uploaded reference files: {{uploaded_files}}{{/if}}
      {{#if _uploads_extracted_text}}Extracted text from uploaded files (preferred for PDFs/text docs): {{_uploads_extracted_text}}{{/if}}

      Based on the user request alone, make your best inference about the project type
      (e.g. creative portfolio, SaaS product, corporate B2B, etc.) and use that to guide
      your research and preliminary tech stack decision.
      The Discovery step after this will ask the user to confirm and refine these choices.

      Conduct thorough research:

      1. Use mcp__exa-search__company_research_exa to research the company deeply
      2. Use mcp__exa-search__web_search_exa to:
         - Research the industry landscape and market positioning
         - Identify 3-5 direct competitors and analyze their websites (design, UX, motion choices)
         - Research current web design trends for this industry in 2025-2026
         - Search specifically for sites in this industry that are considered best-in-class
         - Identify overused category cliches and AI-looking website patterns common in this space
      3. Use mcp__exa-search__web_search_exa to find CURRENT LATEST STABLE versions of:
         - Next.js (search "Next.js latest stable release 2026")
         - Tailwind CSS (search "Tailwind CSS v4 latest version 2026")
         - The specific animation libraries needed for this site's animation_approach (see below)
         Record exact version numbers — use these in package.json, not hardcoded old versions.
      4. Use mcp__exa-search__get_code_context_exa to research:
         - Latest Next.js App Router patterns
         - Component patterns specific to this type of site

      HARD CONSTRAINTS FOR THIS STEP:
      - This step is research-only. Do NOT scaffold code, install packages, or edit files.
      - Do NOT run mutating Bash commands (no npm install, no create-next-app, no git init/commit/push).
      - Do NOT create GitHub repos or deploy to Vercel in this step.

      ═══════════════════════════════════════════════════════════
      TECH STACK DECISION (preliminary — Discovery step will confirm)
      ═══════════════════════════════════════════════════════════

      Based on your inferred project type and industry, make a preliminary tech stack
      decision. The Discovery step will confirm the direction, but you must still make
      an opinionated preliminary choice now with explicit tradeoffs.

      You MUST output one of these four high-level animation_approach values:
      - css_only
      - framer_only
      - gsap_framer
      - gsap_lenis_framer

      But do NOT treat package selection as a rigid one-size-fits-all mapping.
      Evaluate a broad library catalog and choose only what this specific site needs.

      Candidate package catalog (20+):
      - Animation/motion: framer-motion, motion, gsap, @gsap/react, @studio-freight/lenis,
        locomotive-scroll, aos
      - UI/composition: lucide-react, class-variance-authority, tailwind-merge, clsx, cmdk, sonner
      - Forms/validation: react-hook-form, zod, @hookform/resolvers
      - Data/state: @tanstack/react-query, swr, zustand
      - Media/content: embla-carousel-react, swiper, react-player
      - SEO/analytics/perf: schema-dts, @vercel/analytics, @vercel/speed-insights

      For each candidate considered, score 1-5 on:
      - goal_fit
      - ux_impact
      - perf_cost (higher = heavier cost)
      - maintenance_complexity (higher = harder)
      - accessibility_risk (higher = riskier)

      Select packages intentionally:
      - Typical builds: 3-10 packages
      - >10 only when explicitly justified by site goals and UX payoff
      - Prefer minimal viable stack for conversion/performance-sensitive sites

      ═══════════════════════════════════════════════════════════
      OUTPUT
      ═══════════════════════════════════════════════════════════

      Output a comprehensive research report as JSON with these keys:
      - company_info: What the company does, value proposition, market position
      - competitors: Array of 3-5 competitors with URL, strengths, weaknesses, design approach, motion choices
      - design_trends: Current design trends for this industry (typography, color, layout, motion)
      - category_cliches_to_avoid: ["overused tropes, layouts, imagery, or wording patterns to avoid"]
      - ai_sameness_risks: ["specific ways a site in this category can accidentally look AI-generated or templated"]
      - target_audience_analysis: Who the users are, what they care about, conversion triggers
      - content_strategy: Content hierarchy, key differentiators, messaging
      - recommendations: Specific recommendations (sections, features, interactions appropriate for this site type)
      - tech_stack: {
          "animation_approach": "preliminary approach based on inferred project type — Discovery step will confirm",
          "packages_to_install": ["exact list of npm packages to install"],
          "package_decision_matrix": [
            {
              "package": "name",
              "scores": {
                "goal_fit": 1,
                "ux_impact": 1,
                "perf_cost": 1,
                "maintenance_complexity": 1,
                "accessibility_risk": 1
              },
              "decision": "selected|rejected",
              "reason": "brief rationale"
            }
          ],
          "smooth_scroll": true/false,
          "custom_cursor": true/false,
          "parallax": "none/subtle/full",
          "rationale": "Why these choices fit this specific site and goal"
        }
      - package_versions: Object with EXACT latest versions found for all packages
        (e.g. {"next": "15.3.0", "tailwindcss": "4.1.0", "framer-motion": "11.x.x", ...})
    output_key: "research"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 1: Discovery & Questions
  # Ask targeted clarifying questions — now informed by research above.
  # Produces a site_profile that drives ALL design and tech decisions downstream.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Discovery & Questions"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 10
    prompt_template: |
      You are about to build a premium website. Research has already been done on the
      company and industry — use it to ask smarter, more specific questions.

      User request: {{user_prompt}}
      Research findings (company, competitors, industry trends): {{research}}

      {{#if uploaded_files}}The user uploaded reference files: {{uploaded_files}}{{/if}}
      {{#if _uploads_extracted_text}}Extracted text from uploaded files (preferred for PDFs/text docs): {{_uploads_extracted_text}}{{/if}}

      First, review the research. Then use AskUserQuestion to ask 2-4 targeted
      questions. Ask ONE question at a time with clear options.
      Tailor your questions to what's NOT already clear from the user_prompt or research.
      If research + user_prompt already make something obvious, skip that question and ask fewer.

      Focus on these areas — but ONLY ask what you don't already know:

      1. PRIMARY GOAL — REQUIRED QUESTION. You MUST ask this directly.
         What is the #1 thing this site must do?
         Options to offer: Generate leads/conversions | Showcase work/portfolio | Build brand credibility
         | Tell a story / editorial experience | Sell products | Educate / community | Other

      2. SITE TYPE & INDUSTRY — DO NOT ask the user to pick from categories.
         Infer the best-fit site type yourself from:
         - user request
         - research findings
         - company context
         - the user's primary goal answer
         Then commit to the best-fit project_type and explain why in site_profile.reasoning.

      3. VISUAL DIRECTION — DO NOT ask the user to pick from preset style options.
         You decide the most effective visual direction for this specific business and goal.
         The direction must be distinctive, strategically appropriate, and non-generic.
         Derive it from brand context, audience psychology, and conversion intent.

      4. CONTENT APPROACH — Default to mixed and do not ask the user to choose this strategy.
         Set content_approach to "mixed" by default:
         - use user-provided materials when available
         - supplement gaps using research
         If the user explicitly requests otherwise, honor that override.

      5. MUST-HAVES — Any non-negotiables? (specific pages, integrations, technologies)

      6. IMAGES — Do you want AI-generated images for this site?
         Options: "Yes, generate custom AI images" | "No, use simple placeholders (I'll add my own images later)"
         Default to "Yes" if the user doesn't have strong preferences.

      After getting answers, produce a structured discovery brief AND a site_profile that
      determines all downstream technology and design decisions.
      Where the user's answers align with research.tech_stack, confirm them.
      Where they differ (e.g. user wants a different visual direction), use the user's
      intent to override — update animation_approach accordingly.

      Output as JSON with these exact keys:

      {
        "project_type": "one of: creative_portfolio | saas_product | corporate_b2b | ecommerce | hospitality | real_estate | healthcare | personal_brand | startup | other",
        "primary_goal": "one of: conversion | showcase | credibility | storytelling | ecommerce | education | other",
        "visual_direction": "one of: impressive_craft | trust_credibility | excitement | calm_approachable | luxury | clean_efficient | other",
        "style_direction": "2-3 sentence description of aesthetic",
        "target_audience": "Who the site is for and what they care about",
        "key_pages": ["list of pages to build"],
        "key_features": ["list of features needed"],
        "content_approach": "mixed by default (use provided materials + research), unless user explicitly overrides",
        "must_haves": ["non-negotiable requirements"],
        "nice_to_haves": ["optional enhancements"],
        "constraints": "Any constraints or things to avoid",
        "user_answers": "Summary of all clarifications received",

        "site_profile": {
          "motion_intensity": "one of: minimal | moderate | immersive",
          "smooth_scroll": true or false,
          "custom_cursor": true or false,
          "parallax": "none | subtle | full",
          "border_radius": "one of: sharp | subtle | rounded | mixed",
          "animation_approach": "one of: css_only | framer_only | gsap_framer | gsap_lenis_framer",
          "conversion_priority": true or false,
          "generate_images": true or false,
          "reasoning": "2-3 sentences explaining WHY these choices fit this site type and goal"
        }
      }

      Use this decision framework to set the site_profile:

      MOTION INTENSITY:
      - minimal: corporate B2B, SaaS conversion pages, e-commerce, healthcare, real estate
        (animations distract from conversion; trust > wow factor)
      - moderate: startup, personal brand, hospitality, tech products
        (purposeful motion enhances without overwhelming)
      - immersive: creative portfolio, agency, luxury brand, editorial
        (motion IS the product; the experience is the point)

      SMOOTH SCROLL (Lenis):
      - true: creative portfolio, agency, luxury/editorial, brand storytelling
      - false: e-commerce, SaaS conversion, corporate B2B, real estate, healthcare
        (Lenis adds perceptible scroll delay — fatal for task-focused sites)

      CUSTOM CURSOR:
      - true: creative portfolio, agency, luxury brand, immersive brand experience
      - false: everything else (adds friction, invisible on 50%+ of traffic, reduces trust)

      PARALLAX:
      - full: creative portfolio, agency, luxury/editorial
      - subtle: startup, personal brand, hospitality
      - none: e-commerce, SaaS, corporate, real estate, healthcare, conversion pages

      BORDER RADIUS:
      - sharp (0-2px): corporate B2B, fintech, law, consulting, technology firms
      - subtle (4-6px): SaaS products, startups, real estate, professional services
      - rounded (10-16px): healthcare, education, consumer apps, wellness, hospitality
      - mixed/experimental: creative portfolio, agency, luxury fashion

      ANIMATION APPROACH:
      - css_only: conversion landing pages, e-commerce, sites where speed > spectacle
      - framer_only: SaaS, startup, personal brand — React animations without Lenis overhead
      - gsap_framer: corporate, hospitality, real estate — moderate motion, no smooth scroll
      - gsap_lenis_framer: creative portfolio, agency, luxury — full immersive stack
    output_key: "discovery"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 2: Audience & Psychology
  # Ask exactly three questions to understand buyer psychology, trust, and desired feeling.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Audience & Psychology"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 8
    prompt_template: |
      You are defining the psychological strategy for a premium website.
      Research and discovery already exist. Your job is to understand the buyer's
      motivations, hesitation, and desired emotional response before positioning,
      messaging, or visual design begins.

      User request: {{user_prompt}}
      Research: {{research}}
      Discovery: {{discovery}}

      {{#if uploaded_files}}The user uploaded reference files: {{uploaded_files}}{{/if}}
      {{#if _uploads_extracted_text}}Extracted text from uploaded files (preferred for PDFs/text docs): {{_uploads_extracted_text}}{{/if}}

      Use AskUserQuestion to ask EXACTLY 3 questions.
      Ask ONE question at a time with clear options.
      Keep them short, specific, and psychological rather than tactical.

      You MUST cover these three areas:

      1. DECISION TRIGGER
         Ask what will make the right visitor say "yes" fastest.
         Offer tailored options based on the project_type and primary_goal from discovery.

      2. HESITATION / TRUST BARRIER
         Ask what might make the user hesitate, distrust, delay, or bounce.
         Offer tailored options such as price uncertainty, credibility concerns, complexity,
         fear of making the wrong choice, lack of proof, or "other".

      3. DESIRED EMOTIONAL IMPRESSION
         Ask how the site should make the ideal visitor feel in the first 5-10 seconds.
         Offer tailored options such as trust, excitement, aspiration, calm, momentum,
         premium quality, clarity, or "other".

      After the answers, synthesize a psychological strategy. Infer the rest using:
      - research.target_audience_analysis
      - discovery.primary_goal
      - discovery.project_type
      - discovery.target_audience
      - the user's 3 answers

      Output as JSON:
      {
        "primary_audience": "1-2 sentence description",
        "secondary_audience": "optional but specific secondary audience or empty string",
        "awareness_stage": "one of: unaware | problem_aware | solution_aware | product_aware | most_aware",
        "jobs_to_be_done": ["list of concrete jobs the visitor is hiring the site/brand to do"],
        "desired_outcomes": ["what the visitor wants to achieve or feel"],
        "pains_and_frictions": ["specific frustrations, annoyances, or blockers"],
        "anxieties_and_objections": ["specific fears, trust barriers, or reasons to delay"],
        "trust_signals_required": ["proof elements this audience needs to believe"],
        "decision_style": "one of: fast_emotional | deliberate_rational | mixed",
        "conversion_triggers": ["specific triggers that move this audience to action"],
        "emotional_targets": ["feelings the site should create"],
        "emotional_avoidances": ["feelings the site must avoid creating"],
        "voice_cues": {
          "tone_profile": "how the copy should feel psychologically",
          "do_words": ["approved words or semantic territory"],
          "dont_words": ["language to avoid"],
          "reading_level": "target readability level",
          "sentence_style": "short / medium / mixed with rationale"
        },
        "user_answers": "brief summary of the three answers",
        "psychology_summary": "2-4 sentences explaining the audience psychology strategy"
      }
    output_key: "audience_psychology"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 3: Brand Positioning & Message Architecture
  # This defines the strategic story before visual identity.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Brand Positioning & Message Architecture"
    model: "claude-opus-4-6"
    max_budget_usd: 6
    max_turns: 10
    prompt_template: |
      You are defining the strategic message foundation for a premium website.
      This step comes BEFORE visual identity. It determines what the site should mean,
      what it should emphasize, and how it should persuade.

      Research: {{research}}
      Discovery: {{discovery}}
      Audience psychology: {{audience_psychology}}

      Build the best positioning and message architecture for this business.
      You are allowed to be opinionated and proactive. Do not wait for more user input.
      Use your judgment to create the strongest strategic direction.

      Your output must bridge:
      - business reality
      - audience psychology
      - competitive white space
      - site primary_goal

      Cover these layers:

      1. POSITIONING
      - What category/frame the brand should occupy in the user's mind
      - What it should be compared against
      - What it should be known for
      - Why it is meaningfully different

      2. MESSAGE HIERARCHY
      - Primary message: the one idea the homepage must land immediately
      - Secondary support messages
      - Proof messages
      - Objection-handling messages

      3. TONE OF VOICE
      Use the four tone dimensions explicitly:
      - enthusiastic vs matter_of_fact
      - formal vs casual
      - respectful vs irreverent
      - funny vs serious

      4. HERO MESSAGING
      - multiple headline directions
      - multiple subheadline directions
      - CTA options that fit the primary_goal and decision_style

      5. PAGE-LEVEL MESSAGE MAP
      - For each key page from discovery, define what it must prove or move forward

      HARD RULES:
      - Avoid generic AI filler language
      - Avoid category cliches unless strategically justified
      - Make the messages usable by both Claude during build and Gemini during rebuild
      - Be specific enough that a designer/developer could translate this into structure and copy

      Output as JSON:
      {
        "positioning_statement": "clear 2-3 sentence positioning",
        "market_category": "the frame/category to claim",
        "target_segment": "the most valuable audience segment to optimize for",
        "frame_of_reference": "what the audience will compare this against",
        "unique_value": "the sharpest differentiator",
        "reasons_to_believe": ["proof points or arguments"],
        "proof_assets_needed": ["testimonials, logos, results, demos, founder story, etc."],
        "key_objections": [
          {
            "objection": "specific hesitation",
            "response_strategy": "how the site should answer it"
          }
        ],
        "messaging_hierarchy": {
          "primary_message": "the core homepage message",
          "supporting_messages": ["secondary messages"],
          "proof_messages": ["messages that establish credibility"],
          "objection_handling_messages": ["messages that reduce friction"]
        },
        "brand_personality": ["3-5 traits"],
        "tone_of_voice": {
          "dimensions": {
            "enthusiastic_vs_matter_of_fact": "where it should land and why",
            "formal_vs_casual": "where it should land and why",
            "respectful_vs_irreverent": "where it should land and why",
            "funny_vs_serious": "where it should land and why"
          },
          "tone_words": ["approved descriptors"],
          "avoid_words": ["words/phrases to avoid"],
          "style_rules": ["practical writing rules for the whole site"]
        },
        "hero_messaging": {
          "headline_options": ["3 options"],
          "subheadline_options": ["3 options"],
          "primary_cta_options": ["3 options"],
          "secondary_cta_options": ["2-3 options"]
        },
        "page_message_map": [
          {
            "page": "page name",
            "core_job": "what this page must accomplish",
            "message_priority": "what message matters most here",
            "proof_priority": "what this page must prove"
          }
        ],
        "strategy_summary": "2-4 sentences on why this positioning/message system is the right one"
      }
    output_key: "messaging"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 4: Concept Routes & Approval
  # Generate multiple strategic design routes and let the user choose one.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Concept Routes & Approval"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 6
    prompt_template: |
      You are creating concept routes for the website before visual identity is finalized.
      These are not random moodboards. They are strategic design directions based on the
      audience psychology and message architecture.

      Research: {{research}}
      Discovery: {{discovery}}
      Audience psychology: {{audience_psychology}}
      Messaging: {{messaging}}

      Create EXACTLY 3 concept routes.
      Each route must feel materially different, but all three must still be strategically valid.

      For each route define:
      - route_name
      - strategic thesis
      - emotional effect
      - visual language
      - motion behavior
      - image style
      - copy stance
      - strongest use case
      - main risk
      - anti_ai_sameness_moves
      - templated_patterns_to_avoid
      - sample hero direction

      Then use AskUserQuestion to let the user choose:
      - Route 1
      - Route 2
      - Route 3
      - Write my own direction below

      Include a concise summary of all three routes in the question text itself.

      After the answer:
      - If the user chooses a route, lock that route as the concept direction
      - If the user writes their own direction, integrate it and create a chosen concept
      - Preserve any custom message or tone notes the user adds

      Output as JSON:
      {
        "routes": [
          {
            "route_name": "name",
            "strategic_thesis": "why this route works",
            "emotional_effect": "what the visitor should feel",
            "visual_language": "layout/type/color/shape direction",
            "motion_behavior": "how motion should behave",
            "image_style": "what imagery should feel like",
            "copy_stance": "how the writing should sound",
            "strongest_use_case": "who this route best serves",
            "main_risk": "what could go wrong if overdone",
            "anti_ai_sameness_moves": ["specific moves that make this route feel authored, not generated"],
            "templated_patterns_to_avoid": ["specific generic patterns to reject"],
            "sample_hero_direction": "1-2 sentence example"
          }
        ],
        "selected_route_name": "chosen route or custom route name",
        "selection_reason": "why this route is moving forward",
        "user_override_notes": "verbatim or summarized custom notes from the user",
        "concept_principles": ["rules the visual identity/build must follow"],
        "copy_directives": ["message/tone rules to preserve"],
        "image_directives": "image style and sourcing direction",
        "motion_directives": "motion style and restraint/intensity direction",
        "concept_summary": "2-4 sentence summary of the chosen direction"
      }
    output_key: "concept_direction"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 5: Visual Identity System (Sonnet 4.6 — deep creative, with refinement)
  # Visual decisions are driven by site_profile, psychology, messaging, and chosen concept route.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Define Brand Identity"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 10
    refinement_model: "claude-sonnet-4-6"
    prompt_template: |
      Build the VISUAL IDENTITY SYSTEM for this website.
      This is not the step for positioning or messaging invention — those are already defined.
      Your job is to translate the strategy into a coherent visual language.

      Research: {{research}}
      Discovery and site_profile: {{discovery}}
      Audience psychology: {{audience_psychology}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}

      Design to the purpose.
      A great corporate site should not look like a creative portfolio.
      A conversion page should not look like editorial experimentation unless the strategy supports it.

      Read carefully before deciding anything:
      - discovery.project_type
      - discovery.primary_goal
      - discovery.site_profile.border_radius
      - audience_psychology.emotional_targets and emotional_avoidances
      - messaging.brand_personality and tone_of_voice
      - concept_direction.selected_route_name and concept_principles

      ═══════════════════════════════════════════════════════════
      1. COLOR SYSTEM
      ═══════════════════════════════════════════════════════════

      Choose a palette that fits the site type, audience psychology, and approved concept route.
      Do NOT use simplistic color stereotypes. Use color strategically:
      - what should feel trustworthy?
      - what should feel energetic?
      - what should feel premium, calm, bold, or clear?
      - what emotional signals must be avoided?

      Deliver:
      - Primary color (hex + name + usage context)
      - Secondary color (hex + name)
      - Accent color (hex + name) — used for one focal moment per component
      - Neutral dark (hex)
      - Neutral light (hex)
      - Background color (hex)
      - Surface color (hex)
      - Success, warning, error colors
      - Semantic color roles
      - CSS custom properties snippet
      - 2-3 sentence psychological rationale for why this palette fits

      ═══════════════════════════════════════════════════════════
      2. TYPOGRAPHY
      ═══════════════════════════════════════════════════════════

      Typography must match the strategic register. NEVER use: Inter, Roboto, Arial,
      Space Grotesk, Nunito.

      Deliver:
      - Display/heading font (name + Google Fonts import URL)
      - Body font (name + import URL)
      - Mono font if needed
      - Font size scale (base=1rem, sm, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl) in rem
      - Line heights
      - Letter spacing values
      - Font weight rules
      - CSS variables for the type system
      - Typographic rationale linked to the concept route and tone of voice

      ═══════════════════════════════════════════════════════════
      3. BORDER RADIUS & SHAPE LANGUAGE
      ═══════════════════════════════════════════════════════════

      Read discovery.site_profile.border_radius and apply it consistently to ALL components.
      If the concept route justifies nuance, document it clearly without creating inconsistency chaos.

      Output CSS variables for the full radius system and describe the shape language.

      ═══════════════════════════════════════════════════════════
      4. SPACING & LAYOUT RHYTHM
      ═══════════════════════════════════════════════════════════

      THE CORE PATTERN — mandatory on every site:
      Sections are always full-bleed (w-full, background stretches edge-to-edge).
      Content inside sections is constrained to a readable width.
      These are two independent layers — never conflate them.

      Output as structured JSON with:
      {
        "content_width_class": "the Tailwind max-w class for this site",
        "text_width_class": "Tailwind max-w for body copy",
        "section_padding": "Tailwind py classes",
        "container_padding": "px-4 sm:px-6 lg:px-8",
        "card_padding": "p-X md:p-X",
        "grid_gap": "gap-X md:gap-X",
        "full_bleed_sections": ["sections that should break out"],
        "css_variables": "--content-width / --section-padding / --card-padding etc."
      }

      ═══════════════════════════════════════════════════════════
      5. ART DIRECTION & VISUAL MOTIFS
      ═══════════════════════════════════════════════════════════

      Define:
      - background treatment
      - texture/noise usage
      - line/grid/dot motif rules
      - card treatment
      - border treatment
      - shadow/elevation rules
      - icon style
      - image framing rules
      - what the UI must NEVER visually drift into
      - explicit anti-AI-sameness rules for this visual system

      ═══════════════════════════════════════════════════════════
      6. COMPONENT PRINCIPLES
      ═══════════════════════════════════════════════════════════

      Define how the following should feel:
      - navigation
      - buttons
      - cards
      - forms
      - testimonials / proof blocks
      - CTAs

      Output everything as a single structured JSON object with keys:
      colors, typography, border_radius_system, spacing_system, art_direction, visual_motifs, component_principles, anti_sameness_rules
    output_key: "branding"
    refinement: true
    refinement_prompt: |
      Review this visual identity output critically as a senior creative director.

      Check that the visual choices MATCH:
      - the discovery brief
      - the audience psychology strategy
      - the messaging architecture
      - the approved concept route

      Score each visual area 1-10. Improve anything scoring below 8.
      Ensure color contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
      Ensure typography choices are distinctive and appropriate — reject banned fonts.
      Ensure the art direction is specific enough that Gemini can rebuild components from it later.

      ── AI TELLS TO ACTIVELY HUNT AND FIX ──
      - Pure black (#000000) — use near-black instead
      - Purple/blue AI gradient default aesthetic — only use if strategically justified
      - Oversaturated accents that overpower the neutral system
      - 3 equal cards in a row as a default layout habit
      - Generic "startup" styling that ignores the chosen concept route
      - Every section using the same visual recipe with only text swapped
      - Dashboard-mockup-plus-CTA hero if the business is not actually selling software

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 6: Plan Review — approve strategy, concept, and visual identity before architecture
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Plan Review & Approval"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 3
    prompt_template: |
      The strategic and visual direction is complete. Before designing the site architecture,
      present the direction to the user for approval or changes.

      Discovery: {{discovery}}
      Research: {{research}}
      Audience psychology: {{audience_psychology}}
      Messaging: {{messaging}}
      Concept direction: {{concept_direction}}
      Branding: {{branding}}

      Use AskUserQuestion to present a concise summary and ask for approval or notes.

      Format your question with the summary in the question text itself, covering:

      ── AUDIENCE & PSYCHOLOGY ──
      • Who the site is for
      • What they care about
      • What they fear / what proof they need
      • What emotional impression the site should create

      ── POSITIONING & MESSAGING ──
      • Positioning statement
      • Primary message + support messages
      • Tone of voice
      • Hero messaging direction

      ── CONCEPT ROUTE ──
      • The approved concept name
      • The strategic thesis
      • Image and motion direction

      ── VISUAL SYSTEM ──
      • Color palette (primary / accent / background)
      • Typography (display + body)
      • Border radius system + spacing system
      • Art direction / motifs

      ── NEXT STEP ──
      • After approval, the agent will design architecture, then Claude will build the first pass,
        and Gemini will do a rebuild/redesign pass over that implementation.

      Then ask:
      question: "Do you approve this strategy, concept, and visual direction before architecture starts?
      You can approve as-is or add notes, and the architecture/build/rebuild steps will follow your feedback."
      header: "Direction Review"
      options:
        - label: "Looks good — proceed"
          description: "Approve the direction so architecture and build can begin"
        - label: "Add notes below"
          description: "I have feedback or changes — I'll type them in"
        - label: "Change the image approach"
          description: "I want different image sourcing/style guidance before architecture"
        - label: "Change the animation approach"
          description: "I want different motion/interaction guidance before architecture"

      After receiving the answer:
      - If "Looks good": output the summary as approved and proceed
      - If any other option: incorporate the user's typed notes into an updated summary
        and output it. The architecture and implementation steps will use this as their directive.

      Output the final approved direction as structured JSON:
      {
        "approved": true,
        "user_notes": "any notes the user provided, or empty string",
        "image_directives": "any specific image instructions from the user, or empty string",
        "animation_directives": "any specific animation changes requested, or empty string",
        "plan_summary": "the full summary text shown to the user"
      }
    output_key: "plan_approval"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 7: Architecture (Opus 4.6 high effort — structural thinking)
  # Layout decisions are driven by site_profile and primary_goal.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Plan Architecture"
    model: "claude-opus-4-6"
    effort: "high"
    max_budget_usd: 15
    max_turns: 10
    prompt_template: |
      Based on:
      - Discovery and site_profile: {{discovery}}
      - Audience psychology: {{audience_psychology}}
      - Messaging architecture: {{messaging}}
      - Approved concept direction: {{concept_direction}}
      - Research (includes confirmed tech_stack): {{research}}
      - Branding (colors, typography, spacing system, border_radius_system): {{branding}}
      - Plan approval (apply user feedback before architecture): {{plan_approval}}

      If plan_approval.user_notes contains changes, incorporate them before finalizing page
      strategy, layout decisions, and component hierarchy.
      If plan_approval.image_directives changes image sourcing/style, reflect that in the image
      inventory and image treatment recommendations.
      If plan_approval.animation_directives changes motion expectations, reflect that in the
      animation primitives and interaction planning.

      Design the complete site architecture. Every structural decision must serve the
      site's primary_goal, project_type, audience psychology, and message hierarchy.

      ═══════════════════════════════════════════════════════════
      LAYOUT PHILOSOPHY (read site_profile before designing)
      ═══════════════════════════════════════════════════════════

      IF primary_goal = "conversion":
        - Single-column layout on mobile, narrow max-width (max-w-3xl) on desktop for CTA pages
        - Hero: big headline + CTA above the fold, NO scrolling required to see the CTA
        - Remove any sections that don't directly support conversion
        - Conversion hierarchy: Pain → Solution → Proof → CTA (repeated every 2-3 sections)
        - Social proof (testimonials, logos, stats) placed near every CTA
        - Avoid: decorative full-bleed sections that push content down

      IF primary_goal = "showcase":
        - Wide, full-bleed layouts. Let the work breathe.
        - Grid layouts for portfolio/case studies
        - Minimal nav, focused on the work itself
        - Each case study gets its own visual treatment
        - "Less chrome, more content" philosophy

      IF primary_goal = "credibility":
        - Structured, predictable layout (conveys stability)
        - Team section, client logos, press mentions — these are primary sections not nice-to-haves
        - Dense information hierarchy — multiple content sections per page is expected
        - Standard 12-column grid behavior

      IF primary_goal = "storytelling":
        - Tall, scroll-driven sections
        - Full-bleed imagery
        - Large typographic moments
        - Sequences that unfold as you scroll

      ═══════════════════════════════════════════════════════════
      NAVIGATION DESIGN (based on site type)
      ═══════════════════════════════════════════════════════════

      - creative_portfolio: Minimal nav (logo + 3-4 items). Consider hamburger-only even on desktop.
        Or full-screen overlay nav.
      - saas_product: Standard horizontal nav with mega-menu if many features/pricing. Sticky.
      - corporate_b2b: Full horizontal with dropdown menus. Very structured. Sticky.
      - ecommerce: Category navigation is critical. Search bar visible. Cart icon.
      - hospitality / restaurant: Logo-centered with minimal items. Reservation CTA prominent.
      - real_estate: Clean nav with property search or contact CTA always visible.

      ═══════════════════════════════════════════════════════════
      PAGE STRATEGY (think beyond what the user listed)
      ═══════════════════════════════════════════════════════════

      Proactively recommend ALL pages this site needs to succeed. Don't just build what
      the user asked for — think about what's MISSING. Mark each page as:
        [essential] — the site cannot launch without it
        [recommended] — strongly helps the site's primary goal
        [optional] — nice to have but not critical

      Per-site-type essential pages:

      - corporate_b2b / real_estate:
        [essential] Home, About, Services or Products, Contact
        [recommended] Team, Case Studies/Portfolio, FAQ, Careers
        [optional] Blog/News, Press, Partners

      - saas_product / startup:
        [essential] Home, Features, Pricing, Contact/Demo
        [recommended] About, Blog, Customer Stories, Docs/FAQ, Changelog
        [optional] Integrations, Comparison pages, Careers

      - creative_portfolio / agency:
        [essential] Home, Work/Portfolio, About, Contact
        [recommended] Services, Process, Individual Case Studies
        [optional] Blog, Careers, Awards

      - ecommerce:
        [essential] Home, Category pages, Product pages, Cart, Contact
        [recommended] About/Story, FAQ, Shipping & Returns
        [optional] Blog, Gift Cards, Loyalty Program

      - hospitality / restaurant:
        [essential] Home, Menu/Offerings, About/Story, Location & Hours, Reservations/Contact
        [recommended] Events, Gallery, Catering/Private Dining
        [optional] Blog, Gift Cards

      - healthcare / wellness:
        [essential] Home, Services, About/Team, Locations, Contact/Book
        [recommended] Patient Resources, FAQ, Insurance/Billing
        [optional] Blog, Testimonials, Careers

      - personal_brand:
        [essential] Home, About, Work/Portfolio, Contact
        [recommended] Blog, Speaking, Services
        [optional] Newsletter, Press, Recommendations

      Universal pages (all sites):
        [essential] Custom 404 page
        [recommended] Privacy Policy, Terms of Service

      Include all recommended pages in the architecture output and mark them clearly as
      essential / recommended / optional.

      ═══════════════════════════════════════════════════════════
      OUTPUT: Complete site architecture as JSON
      ═══════════════════════════════════════════════════════════

      1. PAGE TREE
         - Every page with URL path, title, purpose, priority (essential/recommended/optional)
         - Logical grouping and hierarchy

      2. COMPONENT HIERARCHY (per page)
         - Every section/component top to bottom
         - Component name, props, data needs
         - Be specific: "HeroSection", "FeatureGrid", "TestimonialsCarousel"
         - Note any components that are conversion-critical (mark as priority: true)
         - For every major section, note which messaging.priority it expresses
         - For every important page, define one signature composition move that makes it feel authored rather than templated
         - Note any layout patterns explicitly banned because they would make the page look AI-generated

      3. SHARED COMPONENTS
         - Navigation (structure, items, mobile behavior)
         - Footer (link groups, legal links)
         - Layout wrapper
         - Reusable UI atoms (Button, Card, Badge, Input)
         - NOTE: Button component must use the border_radius from branding.border_radius_system

      4. FILE STRUCTURE
         - Exact file paths for every component and page
         - Next.js App Router: app/layout.tsx, app/page.tsx, etc.
         - components/layout/Header.tsx, components/ui/Button.tsx, etc.

      5. IMAGE INVENTORY
         - Every image the site needs
         - For each: filename, purpose, aspect ratio (choose based on layout), where used
         - Include: hero, features, about/team, favicon, OG image
         - Note hero image treatment: full-bleed, contained, or no image (copy-only hero)

      5B. VIDEO INVENTORY
          Consider whether this site type benefits from video content. Videos add
          credibility, engagement, and conversion lift when used appropriately.

          Per-site-type video recommendations:
          - saas_product / startup: Product demos, feature walkthroughs, customer testimonials
          - hospitality / restaurant: Ambiance/atmosphere video, behind-the-scenes, chef/staff stories
          - real_estate: Property walkthroughs, neighborhood tours, aerial footage
          - creative_portfolio / agency: Showreel, project case study videos, process videos
          - corporate_b2b: Company culture video, client testimonial videos, thought leadership
          - ecommerce: Product demonstration videos, unboxing, 360-degree views
          - healthcare: Provider introductions, facility tours, patient education
          - personal_brand: Speaking clips, course previews, about-me video

          For each video, specify:
          - location: which section/page it appears in
          - purpose: what it communicates
          - aspect_ratio: 16:9 (standard), 9:16 (mobile/social), 1:1 (square)
          - autoplay: true (muted background) or false (user-initiated with play button)

          If no videos are appropriate for this site type, output an empty array.
          Output: { "videos": [...] }

      6. SEO STRATEGY PER PAGE
         - Target keywords, meta title, meta description

      7. ANIMATION PRIMITIVES NEEDED
         - Based on research.tech_stack.animation_approach, list which animation components
           will be needed (Reveal, StaggerChildren, ParallaxLayer, etc. — or CSS classes only)
         - This list drives Step 9 (Motion Infrastructure)

      8. INTEGRATION POINTS
         - Contact form, booking systems, CRM handoff points, etc.
    output_key: "architecture"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 8: Scaffold & Build (Opus 4.6 high effort — heavy code generation)
  # Installs ONLY the packages chosen in Step 1. No hardcoded animation stack.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Scaffold & Build"
    model: "claude-opus-4-6"
    effort: "high"
    max_budget_usd: 15
    max_turns: 20
    prompt_template: |
      Build the complete website from scratch. You have full filesystem access.

      Architecture: {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Research (includes confirmed tech_stack): {{research}}
      Discovery and site_profile: {{discovery}}
      Audience psychology: {{audience_psychology}}
      Plan approval (apply user notes before coding): {{plan_approval}}

      If plan_approval.user_notes contains changes, incorporate them before scaffolding/building.
      If plan_approval.image_directives changes image sourcing/style, reflect that in placeholder
      strategy and image inventory implementation.
      If plan_approval.animation_directives changes motion expectations, preserve those directives
      in component structure so the Motion & Interaction Infrastructure step can implement them cleanly.

      IMPORTANT — Package versions: {{research.package_versions}}
      Use THESE exact versions when installing packages.

      ═══════════════════════════════════════════════════════════
      0. GIT / GITHUB (THIS STEP AND ALL STEPS UNTIL FINAL HANDOFF)
      ═══════════════════════════════════════════════════════════

      - Work stays LOCAL under site/. Do NOT call github_create_repo or github_push_files in this step.
      - Do NOT configure a GitHub remote or run gh repo create here. You may use local git (git init, commits)
        only for your own checkpointing — no remote, no push — until the "Finalize GitHub Handoff" step.
      - One repository will be created or linked only at final handoff; every later change is a commit to that repo, not a new repo.

      ═══════════════════════════════════════════════════════════
      1. SCAFFOLD THE PROJECT
      ═══════════════════════════════════════════════════════════

      - Run: npx create-next-app@latest site --typescript --tailwind --app --src-dir --no-import-alias --yes
      - Verify Next.js version: cat site/package.json | grep '"next"'

      ═══════════════════════════════════════════════════════════
      2. INSTALL ONLY THE DECIDED PACKAGES
      ═══════════════════════════════════════════════════════════

      Read research.tech_stack.packages_to_install — install EXACTLY these packages.
      Do NOT install animation libraries that are not in this list.

      The packages_to_install list was determined by the site's project_type and primary_goal
      using a scored package decision matrix. Trust it unless there's a hard technical conflict.

      - If the list is empty or css_only → no animation libraries. Tailwind handles all transitions.
      - If it includes "framer-motion" → install framer-motion only (no Lenis, no GSAP unless listed)
      - If it includes "gsap" → install gsap and @gsap/react
      - If it includes "@studio-freight/lenis" → install it alongside gsap and framer-motion

      Always also install: lucide-react (icons) and any site-specific packages from architecture.

      Run: cd site && npm install [packages from packages_to_install]@latest lucide-react@latest

      ═══════════════════════════════════════════════════════════
      3. CONFIGURE NEXT.JS & TAILWIND
      ═══════════════════════════════════════════════════════════

      Set up in globals.css:
      - ALL CSS custom properties from branding.colors
      - ALL border radius variables from branding.border_radius_system
      - ALL spacing variables from branding.spacing_system
      - ALL typography CSS variables

      Configure fonts in layout.tsx using next/font/google (the exact fonts from branding.typography).

      CRITICAL: Add Zippy CDN domain to next.config.ts:
      ```
      images: {
        remotePatterns: [{ protocol: 'https', hostname: 'storage.zipline.agency' }],
      },
      ```

      ═══════════════════════════════════════════════════════════
      4. BUILD EVERY PAGE AND COMPONENT
      ═══════════════════════════════════════════════════════════

      Follow the architecture exactly. Apply these site-type-specific patterns:

      CONVERSION-FOCUSED SITES (primary_goal = "conversion"):
      - Hero: Full headline + CTA visible without scrolling on mobile (375px)
      - CTA buttons: Large (min 48px height), high contrast, above the fold
      - Social proof: Place within first two sections (logos, testimonials, stats)
      - Avoid: heavy decorative elements that push the CTA below the fold
      - Hover: Simple, fast (duration-150) — don't distract from conversion path
      - Form elements: large touch targets, clear labels, minimal fields

      SHOWCASE / PORTFOLIO SITES (primary_goal = "showcase"):
      - Wide layouts, full-bleed sections, generous whitespace
      - Case studies: full-bleed hero images, bold typography
      - Grid for work: asymmetric if the branding supports it
      - Minimal UI chrome — let the work dominate

      CREDIBILITY / CORPORATE SITES (primary_goal = "credibility"):
      - Structured, predictable grid (12-column)
      - Team section, client logos, press — primary sections
      - Conservative layout, no experimental structures
      - Trust signals near every CTA

      ALL SITES:
      - Use the exact colors and fonts from branding
      - Use the exact positioning, tone, and copy hierarchy from messaging
      - Use the selected concept_direction to drive layout attitude, composition, and atmosphere
      - Write REAL content — never use "Lorem ipsum" or placeholder text
      - Mobile-first responsive (Tailwind)
      - Server Components by default, 'use client' only when needed
      - Semantic HTML (main, section, article, nav, header, footer)
      - Apply border_radius_system consistently: every card, button, input, image container
        uses the correct --radius variables from globals.css (never mix rounding styles)
      - Every important page must include at least one signature composition move from architecture
      - Do NOT let every section use the same recipe with swapped content
      - If a page has 3 benefits/features/testimonials, do NOT default to 3 equal icon cards
      - Do NOT default to the same AI-coded hero pattern:
        badge -> headline -> subhead -> two CTAs -> generic mockup/blob background
        unless the architecture and concept route explicitly justify it
      - Vary composition intentionally across sections:
        alternate dense vs open rhythm, asymmetry vs structure, proof vs story
      - If using cards, vary scale, grouping, emphasis, or composition so the page does not read like template output
      - Use research.category_cliches_to_avoid and research.ai_sameness_risks as hard negatives
      - IMAGE PLACEHOLDERS (based on discovery.site_profile.generate_images):

        IF generate_images = true (default):
          Use colored gradient backgrounds with data-image attribute
          (e.g., data-image="hero") so the Image Generation step can find and replace them.

        IF generate_images = false:
          Use simple, clearly labeled placeholder divs. These should be obvious and easy
          for the client to replace with their own images later:
          ```tsx
          <div className="bg-gray-100 border-2 border-dashed border-gray-300 flex items-center
            justify-center text-gray-400 text-sm font-medium" data-image="hero"
            style={{ aspectRatio: '16/9' }}>
            Put hero image here
          </div>
          ```
          Use descriptive labels: "Put hero image here", "Put team photo here",
          "Put product screenshot here", etc. Always include the data-image attribute
          and set an appropriate aspect-ratio for each placeholder.

      - VIDEO PLACEHOLDERS (if architecture.video_inventory has entries):
        Create video placeholder areas for each video in the inventory:
        ```tsx
        <div className="bg-gray-900 flex items-center justify-center text-white
          aspect-video relative" data-video="hero-video">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <span className="text-sm text-gray-400">Put video here</span>
          </div>
        </div>
        ```
        For hero background videos, use absolute positioning behind hero content.
        Include data-video attribute with a descriptive identifier.

      ═══════════════════════════════════════════════════════════
      5. INTERACTION BASELINE (based on animation_approach)
      ═══════════════════════════════════════════════════════════

      Read research.tech_stack.animation_approach and add the appropriate baseline interactions:

      IF css_only:
        - Add Tailwind transition classes to all interactive elements
        - Buttons: transition-all duration-150 ease-out hover:brightness-110 active:scale-95
        - Cards: transition-shadow duration-200 hover:shadow-md
        - Links: transition-colors duration-150
        - NO JavaScript animation code — pure CSS only

      IF framer_only or gsap_framer or gsap_lenis_framer:
        - Add placeholder comments in hero components: {/* Reveal animation added in Step 9 */}
        - Add hover state CSS for all interactive elements (the JS layer comes in Step 9)
        - Buttons still need transition classes as a CSS fallback

      ═══════════════════════════════════════════════════════════
      6. QUALITY STANDARDS
      ═══════════════════════════════════════════════════════════

      - Every component: proper TypeScript with typed props
      - Tailwind CSS exclusively — no inline styles, no CSS modules
      - Consistent spacing using the branding.spacing_system variables
      - Navigation: Next.js Link component, keyboard-accessible

      MOBILE NAVIGATION (non-negotiable — this must work):
        The mobile menu MUST function correctly. Follow this exact pattern:

        ```tsx
        'use client';
        import { useState, useEffect } from 'react';

        export function Header() {
          const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

          // Close on Escape key
          useEffect(() => {
            const handleEsc = (e: KeyboardEvent) => {
              if (e.key === 'Escape') setMobileMenuOpen(false);
            };
            document.addEventListener('keydown', handleEsc);
            return () => document.removeEventListener('keydown', handleEsc);
          }, []);

          // Lock body scroll when menu is open
          useEffect(() => {
            document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
            return () => { document.body.style.overflow = ''; };
          }, [mobileMenuOpen]);

          return (
            <header>
              <nav className="...">
                {/* Desktop nav: hidden on mobile */}
                <div className="hidden md:flex items-center gap-8">
                  {/* nav links */}
                </div>

                {/* Mobile hamburger: visible on mobile only */}
                <button
                  className="md:hidden"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="mobile-menu"
                  aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                >
                  {/* hamburger or X icon */}
                </button>
              </nav>

              {/* Mobile menu overlay */}
              {mobileMenuOpen && (
                <div id="mobile-menu" className="fixed inset-0 z-50" role="dialog" aria-modal="true">
                  {/* Backdrop — close on click */}
                  <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
                  {/* Menu panel */}
                  <div className="relative z-10 ...">
                    {/* Close button at top */}
                    {/* Nav links — each calls setMobileMenuOpen(false) on click */}
                  </div>
                </div>
              )}
            </header>
          );
        }
        ```

        VERIFY mentally: tap hamburger → menu appears → tap nav link → menu closes → page navigates.
        If ANY of these steps would fail, fix the implementation before moving on.

      - Custom 404 page (app/not-found.tsx) matching brand
      - Loading.tsx skeleton files for dynamic content pages

      LAYOUT RULES (enforce on every component):
      - HERO VIEWPORT RULES (critical for mobile):
        • NEVER use h-screen (causes catastrophic layout jumping on iOS Safari)
        • Use min-h-[100svh] on mobile, min-h-[100dvh] on desktop:
          className="min-h-[100svh] md:min-h-[100dvh]"
          (svh = small viewport height, accounts for mobile browser chrome)
        • Add pb-20 md:pb-0 to the hero section to reserve space for the sticky mobile
          CTA bar (added in Performance step) — prevents content from being hidden behind it
        • The hero must show the COMPLETE headline, subheadline, and CTA without scrolling
          at 375px mobile width. The next section must NOT be visible until the user scrolls.
        • VERIFY: At 375px width, can a user see the full hero content including CTAs
          without scrolling? If not, reduce hero content or adjust spacing.
      - NEVER use complex flexbox percentage math (w-[calc(33%-1rem)])
        ALWAYS use CSS Grid for multi-column layouts: grid grid-cols-1 md:grid-cols-3 gap-6
      - NEVER use 3 equal cards in a horizontal row — this is the most recognizable AI layout tell
        Use instead: 2-column zig-zag, asymmetric grid (grid-cols-[2fr_1fr]), or bento-style tiles
      - NEVER stack pages as a sequence of interchangeable rounded sections with identical spacing,
        identical headings, and identical CTA blocks. That reads as generated template output.

      FULL-BLEED + CONSTRAINED CONTENT — the mandatory two-layer pattern:
      Every section background is ALWAYS full-bleed (w-full). Content inside is ALWAYS
      constrained using the content_width_class from branding.spacing_system. Never hardcode
      max-w-7xl — use the CSS variable or class the branding step chose for this specific site.

      Structure every section like this:
      ```tsx
      <section className="w-full bg-[var(--color-background)]">
        <div className={`${contentWidth} mx-auto px-4 sm:px-6 lg:px-8`}>
          {/* content here */}
        </div>
      </section>
      ```

      For sections that should intentionally break out of the container (hero imagery,
      full-bleed galleries, atmospheric photo sections), let the background AND image span
      w-full while keeping text/overlaid content constrained within the content width.
      These "breakout" sections are listed in branding.spacing_system.full_bleed_sections.

      Body copy paragraphs: always apply max-w-prose or max-w-[65ch] — never let a paragraph
      run the full container width, even on wide-container sites. Long lines destroy readability.

      ANIMATION PERFORMANCE RULES (enforce on every animated component):
      - NEVER animate top, left, width, or height — these cause layout thrashing
        ONLY animate transform (translateX/Y/scale/rotate) and opacity — GPU-accelerated
      - Grain/noise texture overlays MUST be on fixed, pointer-events-none pseudo-elements only
        NEVER on scrolling containers — causes continuous GPU repaints and mobile jank
      - Perpetual/looping animations (infinite loops, ambient motion) MUST be isolated in their
        own memoized Client Component (React.memo) — never co-located with parent layout state
        to prevent parent re-renders from disrupting the animation loop

      ═══════════════════════════════════════════════════════════
      7. FINAL CHECK
      ═══════════════════════════════════════════════════════════

      - Run: cd site && npx tsc --noEmit (fix TypeScript errors)
      - Run: cd site && npm run build (fix build errors)

      ═══════════════════════════════════════════════════════════
      8. EFFICIENCY (save tokens and time)
      ═══════════════════════════════════════════════════════════

      - Build each component file individually — write the complete file, move on
      - When creating similar components (e.g., multiple page layouts), adapt the first
        one rather than rewriting from scratch each time
      - Run: cd site && npx tsc --noEmit every 3-4 components to catch errors early
        (cheaper than fixing a pile of errors at the end)
      - Don't rewrite entire files for small changes — use targeted edits

      Build the COMPLETE site. Do not stop until every page and component is built.
    output_key: "build_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 9: Motion & Interaction Infrastructure
  # FULLY CONDITIONAL on the animation_approach chosen in Step 1.
  # Not every site gets Lenis. Not every site gets a custom cursor.
  # The site type determines the motion stack.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Motion & Interaction Infrastructure"
    model: "claude-sonnet-4-6"
    effort: "high"
    max_budget_usd: 5
    max_turns: 15
    prompt_template: |
      The site has been built. Now implement the motion and interaction infrastructure
      appropriate for THIS site's type and goals.
      The site lives at ./site/. ALWAYS prefix shell commands with "cd site && ".

      Branding: {{branding}}
      Architecture: {{architecture}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Research (includes tech_stack decisions): {{research}}
      Discovery (includes site_profile): {{discovery}}
      Audience psychology: {{audience_psychology}}
      Plan approval (respect animation notes): {{plan_approval}}

      If plan_approval.animation_directives contains changes, follow those directives first and
      override the default motion interpretation where they conflict.

      ═══════════════════════════════════════════════════════════
      FIRST: READ THE ANIMATION APPROACH
      ═══════════════════════════════════════════════════════════

      Read research.tech_stack.animation_approach and site_profile carefully.
      Then follow ONLY the section below that matches it.

      ═══════════════════════════════════════════════════════════
      ══ PATH A: css_only ══
      (Conversion pages, e-commerce, corporate B2B where speed > spectacle)
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "css_only":

      No JavaScript animation libraries are needed. The goal is PERFORMANCE.
      Tailwind's built-in transitions handle all interactions.

      1. ENSURE GLOBAL TRANSITION BASELINE (in globals.css):
         ```css
         /* Fast, purposeful transitions only */
         button, a, [role="button"] {
           transition: all 150ms ease-out;
         }
         ```

      2. ADD SCROLL-REVEAL WITH NATIVE CSS INTERSECTION OBSERVER:
         Create site/src/components/ui/FadeIn.tsx — uses IntersectionObserver (no library):
         ```tsx
         'use client';
         import { useEffect, useRef, ReactNode } from 'react';

         export function FadeIn({ children, className, delay = 0 }:
           { children: ReactNode; className?: string; delay?: number }) {
           const ref = useRef<HTMLDivElement>(null);
           useEffect(() => {
             const el = ref.current; if (!el) return;
             const observer = new IntersectionObserver(
               ([entry]) => { if (entry.isIntersecting) { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; observer.disconnect(); } },
               { threshold: 0.1, rootMargin: '-60px' }
             );
             observer.observe(el);
             return () => observer.disconnect();
           }, []);
           return (
             <div ref={ref} className={className}
               style={{ opacity: 0, transform: 'translateY(16px)',
                 transition: `opacity 0.5s ease-out ${delay}s, transform 0.5s ease-out ${delay}s` }}>
               {children}
             </div>
           );
         }
         ```
         Note: Respects prefers-reduced-motion via the CSS transition (0.01ms override in globals.css).

      3. ADD REDUCED MOTION SUPPORT in globals.css:
         ```css
         @media (prefers-reduced-motion: reduce) {
           *, *::before, *::after {
             animation-duration: 0.01ms !important;
             transition-duration: 0.01ms !important;
           }
         }
         ```

      4. DO NOT add: Lenis, GSAP, Framer Motion, custom cursor, loading screen,
         parallax, magnetic buttons, or scroll progress bar by default.
         These add overhead and distraction on conversion-focused sites.
         Exception: only if a package is explicitly selected in research.tech_stack.packages_to_install
         and you can justify measurable UX value without harming performance.

      5. FOCUS BUDGET ON: Fast load, clear CTAs, button active states (active:scale-95),
         hover brightness changes (hover:brightness-105), smooth color transitions on links.

      VALIDATE:
      - Run: cd site && npm run build
      - Run: cd site && npx tsc --noEmit
      Output a summary of CSS transitions added.

      ═══════════════════════════════════════════════════════════
      ══ PATH B: framer_only ══
      (SaaS, startup, personal brand — React animations without Lenis overhead)
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "framer_only":

      Framer Motion handles all animations. Standard browser scroll (no Lenis).
      Goal: polished React component animations without scroll-lag overhead.

      1. VERIFY Framer Motion is installed (was installed in Step 8).

      2. PAGE TRANSITIONS:
         Create site/src/components/providers/PageTransition.tsx:
         ```tsx
         'use client';
         import { AnimatePresence, motion } from 'framer-motion';
         import { usePathname } from 'next/navigation';
         const variants = {
           hidden: { opacity: 0, y: 8 },
           enter:  { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
           exit:   { opacity: 0, transition: { duration: 0.2 } },
         };
         export function PageTransition({ children }: { children: React.ReactNode }) {
           const pathname = usePathname();
           return (
             <AnimatePresence mode="wait" initial={false}>
               <motion.div key={pathname} variants={variants} initial="hidden" animate="enter" exit="exit">
                 {children}
               </motion.div>
             </AnimatePresence>
           );
         }
         ```
         Add to layout.tsx wrapping children.

      3. REUSABLE SCROLL-REVEAL PRIMITIVES (Framer Motion useInView):
         Create site/src/components/ui/Reveal.tsx:
         ```tsx
         'use client';
         import { motion, useReducedMotion } from 'framer-motion';
         import type { ReactNode } from 'react';
         interface RevealProps {
           children: ReactNode; delay?: number;
           direction?: 'up' | 'down' | 'left' | 'right' | 'none';
           distance?: number; duration?: number; className?: string; once?: boolean;
         }
         export function Reveal({ children, delay = 0, direction = 'up', distance = 32,
           duration = 0.6, className, once = true }: RevealProps) {
           const prefersReduced = useReducedMotion();
           const offset = prefersReduced ? {} : { up: { y: distance }, down: { y: -distance },
             left: { x: distance }, right: { x: -distance }, none: {} }[direction];
           return (
             <motion.div className={className}
               initial={{ opacity: prefersReduced ? 1 : 0, ...offset }}
               whileInView={{ opacity: 1, x: 0, y: 0 }}
               viewport={{ once, margin: '-60px' }}
               transition={{ duration: prefersReduced ? 0 : duration, delay, ease: [0.22, 1, 0.36, 1] }}>
               {children}
             </motion.div>
           );
         }
         ```

         Create site/src/components/ui/StaggerChildren.tsx (same pattern as full stack).

      4. DO NOT add: Lenis (no smooth scroll for this site type — it adds friction),
         GSAP, custom cursor, parallax effects, or pinned scroll sections by default.
         Exception: only if explicitly selected in research.tech_stack.packages_to_install
         and justified against primary_goal/performance constraints.

      5. REDUCED MOTION in globals.css (Framer Motion also handles this via useReducedMotion):
         ```css
         @media (prefers-reduced-motion: reduce) {
           *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
         }
         ```

      VALIDATE: npm run build + npx tsc --noEmit. Output summary.

      ═══════════════════════════════════════════════════════════
      ══ PATH C: gsap_framer ══
      (Corporate, hospitality, real estate — moderate motion, no smooth scroll)
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "gsap_framer":

      GSAP for complex timelines and scroll-triggered sequences.
      Framer Motion for component animations and transitions.
      Standard browser scroll — NO Lenis (these site types don't need scroll latency).

      1. VERIFY gsap, @gsap/react, framer-motion are installed.

      2. GSAP ScrollTrigger registration (without Lenis):
         Create site/src/components/providers/GSAPProvider.tsx:
         ```tsx
         'use client';
         import { useEffect } from 'react';
         import { gsap } from 'gsap';
         import { ScrollTrigger } from 'gsap/ScrollTrigger';
         gsap.registerPlugin(ScrollTrigger);
         export function GSAPProvider({ children }: { children: React.ReactNode }) {
           useEffect(() => { return () => ScrollTrigger.getAll().forEach(t => t.kill()); }, []);
           return <>{children}</>;
         }
         ```
         Add to layout.tsx.

      3. PAGE TRANSITIONS (Framer Motion — simple, professional):
         Create site/src/components/providers/PageTransition.tsx with a clean fade (no y offset).
         ```tsx
         'use client';
         import { AnimatePresence, motion } from 'framer-motion';
         import { usePathname } from 'next/navigation';
         export function PageTransition({ children }: { children: React.ReactNode }) {
           const pathname = usePathname();
           return (
             <AnimatePresence mode="wait" initial={false}>
               <motion.div key={pathname}
                 initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.3 } }}
                 exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                 {children}
               </motion.div>
             </AnimatePresence>
           );
         }
         ```

      4. REUSABLE PRIMITIVES: Create Reveal.tsx and StaggerChildren.tsx
         (same as framer_only path above).

      5. DO NOT add: Lenis, custom cursor, loading screen with elaborate animation,
         parallax (unless site_profile.parallax = "subtle" — then add ParallaxLayer.tsx
         for hero sections only, disabled on mobile).
         Optional packages selected in research.tech_stack.packages_to_install may be used
         only when they reinforce this site's goals and preserve performance.

      6. REDUCED MOTION support in globals.css.

      VALIDATE: npm run build + npx tsc --noEmit. Output summary.

      ═══════════════════════════════════════════════════════════
      ══ PATH D: gsap_lenis_framer ══
      (Creative portfolio, agency, luxury brand — full immersive stack)
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "gsap_lenis_framer":

      The full immersive stack. Lenis smooth scroll + GSAP ScrollTrigger + Framer Motion.
      This is appropriate BECAUSE the site type demands it: the scroll experience IS the product.

      ── LENIS CONFIGURATION ──
      Tune the Lenis duration to match the site's pacing:
      - Creative portfolio (fast/snappy navigation desired): duration: 0.8–1.0
      - Luxury / editorial brand (slow, cinematic): duration: 1.2–1.4
      - Agency (balanced): duration: 1.0–1.2

      Read the project_type and visual_direction from site_profile to pick the right duration.
      A design portfolio where people need to browse many pieces should use shorter duration
      (0.8-0.9) so it feels responsive, not sluggish. A luxury brand should feel unhurried (1.3).

      Create site/src/components/providers/SmoothScrollProvider.tsx:
      ```tsx
      'use client';
      import { useEffect, useRef } from 'react';
      import Lenis from '@studio-freight/lenis';
      import { gsap } from 'gsap';
      import { ScrollTrigger } from 'gsap/ScrollTrigger';
      gsap.registerPlugin(ScrollTrigger);

      // TUNE THIS based on site type:
      // Portfolio browsing → 0.8-0.9 | Balanced → 1.0-1.2 | Luxury/cinematic → 1.2-1.4
      const LENIS_DURATION = [INSERT_DURATION_BASED_ON_SITE_TYPE];

      export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
        const lenisRef = useRef<Lenis | null>(null);
        useEffect(() => {
          const lenis = new Lenis({
            duration: LENIS_DURATION,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            touchMultiplier: 2,
          });
          lenisRef.current = lenis;
          lenis.on('scroll', ScrollTrigger.update);
          gsap.ticker.add((time) => { lenis.raf(time * 1000); });
          gsap.ticker.lagSmoothing(0);
          return () => {
            lenis.destroy();
            gsap.ticker.remove((time) => lenis.raf(time * 1000));
          };
        }, []);
        return <>{children}</>;
      }
      ```
      Add to layout.tsx wrapping children.

      ── PAGE TRANSITIONS (Framer Motion) ──
      Create site/src/components/providers/PageTransition.tsx:
      ```tsx
      'use client';
      import { AnimatePresence, motion } from 'framer-motion';
      import { usePathname } from 'next/navigation';
      const variants = {
        hidden: { opacity: 0, y: 12 },
        enter:  { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
        exit:   { opacity: 0, y: -8, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
      };
      export function PageTransition({ children }: { children: React.ReactNode }) {
        const pathname = usePathname();
        return (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={pathname} variants={variants} initial="hidden" animate="enter" exit="exit">
              {children}
            </motion.div>
          </AnimatePresence>
        );
      }
      ```

      ── LOADING SEQUENCE ──
      Create site/src/components/ui/LoadingScreen.tsx:
      - Full-screen overlay, sessionStorage to show only once
      - Brand element animates in (logo, wordmark, or abstract shape)
      - Aesthetic counter or progress bar (1.0-1.5s based on brand pacing)
      - Elegant exit animation (split/slide/fade — match the brand personality)
      - Use Framer Motion for the sequence
      - onComplete callback to signal layout loading is done
      Design to match the brand personality from messaging.brand_personality and concept_direction.

      ── CUSTOM CURSOR (desktop only — do NOT add on mobile) ──
      Create site/src/components/ui/CustomCursor.tsx:
      - cursor: none on desktop body only
      - Primary dot (8px) follows mouse with no lag
      - Ring (32px) follows with spring delay (Framer Motion useSpring)
      - On hover over links/buttons: ring expands to 48px, accent color fill at 20% opacity
      - On hover over images: ring shows "View" label
      - On click: pulse animation
      - ONLY render on desktop — use useMediaQuery('(pointer: fine)') to detect mouse

      CRITICAL PERFORMANCE RULE: NEVER use React useState to track the cursor mouse position.
      useState on mousemove causes a full React re-render at up to 60fps, which will destroy
      performance. Use EXCLUSIVELY Framer Motion useMotionValue + useSpring:
      ```tsx
      const mouseX = useMotionValue(0);
      const mouseY = useMotionValue(0);
      const springX = useSpring(mouseX, { stiffness: 500, damping: 40 });
      const springY = useSpring(mouseY, { stiffness: 500, damping: 40 });
      // Update: mouseX.set(e.clientX) — no setState, no re-render
      ```

      Create site/src/hooks/useMediaQuery.ts.

      ── REUSABLE SCROLL-REVEAL PRIMITIVES ──

      Reveal.tsx (direction, delay, distance, duration, once):
      ```tsx
      'use client';
      import { motion, useReducedMotion } from 'framer-motion';
      import type { ReactNode } from 'react';
      interface RevealProps {
        children: ReactNode; delay?: number;
        direction?: 'up' | 'down' | 'left' | 'right' | 'none';
        distance?: number; duration?: number; className?: string; once?: boolean;
      }
      export function Reveal({ children, delay = 0, direction = 'up', distance = 40,
        duration = 0.7, className, once = true }: RevealProps) {
        const prefersReduced = useReducedMotion();
        const offset = prefersReduced ? {} :
          { up: { y: distance }, down: { y: -distance }, left: { x: distance }, right: { x: -distance }, none: {} }[direction];
        return (
          <motion.div className={className}
            initial={{ opacity: prefersReduced ? 1 : 0, ...offset }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once, margin: '-80px' }}
            transition={{ duration: prefersReduced ? 0 : duration, delay, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        );
      }
      ```

      StaggerChildren.tsx + StaggerItem:
      ```tsx
      'use client';
      import { motion, useReducedMotion } from 'framer-motion';
      import type { ReactNode } from 'react';
      const container = (stagger = 0.1) => ({
        hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: 0.1 } },
      });
      const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } };
      export function StaggerChildren({ children, stagger = 0.1, className }:
        { children: ReactNode; stagger?: number; className?: string }) {
        const prefersReduced = useReducedMotion();
        return (
          <motion.div className={className}
            variants={prefersReduced ? {} : container(stagger)}
            initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
            {children}
          </motion.div>
        );
      }
      export const StaggerItem = motion.div;
      export const staggerItemVariants = item;
      ```

      ParallaxLayer.tsx (ONLY if site_profile.parallax = "full" or "subtle"):
      ```tsx
      'use client';
      import { useRef } from 'react';
      import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
      import type { ReactNode } from 'react';
      export function ParallaxLayer({ children, speed = 0.3, className }:
        { children: ReactNode; speed?: number; className?: string }) {
        const ref = useRef<HTMLDivElement>(null);
        const prefersReduced = useReducedMotion();
        const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
        const y = useTransform(scrollYProgress, [0, 1],
          prefersReduced ? ['0px', '0px'] : [`${speed * -100}px`, `${speed * 100}px`]);
        return (
          <div ref={ref} className={`relative overflow-hidden ${className || ''}`}>
            <motion.div style={{ y }}>{children}</motion.div>
          </div>
        );
      }
      ```
      If site_profile.parallax = "subtle": use speed values 0.1–0.15 only (hero sections only).
      If site_profile.parallax = "none": do NOT create ParallaxLayer.tsx.

      ── REDUCED MOTION ──
      Add to globals.css:
      ```css
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
      ```

      VALIDATE: npm run build + npx tsc --noEmit. Output summary.

      ═══════════════════════════════════════════════════════════
      AFTER ALL PATHS: OUTPUT SUMMARY
      ═══════════════════════════════════════════════════════════

      Output:
      - animation_approach used: [value]
      - smooth_scroll: [true/false]
      - custom_cursor: [true/false]
      - parallax: [none/subtle/full]
      - files created: [list]
      - files modified: [list]
      - rationale: why these choices fit the site type
    output_key: "motion_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 10: Gemini Rebuild Pass (Sonnet 4.6 orchestrating Gemini 3.1 Pro)
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Gemini Rebuild Pass"
    model: "claude-sonnet-4-6"
    max_budget_usd: 7
    max_turns: 15
    prompt_template: |
      Claude has produced the first implementation of the website and motion infrastructure is installed.
      Gemini is now being used as a redesign/rebuild layer over Claude's first pass.
      The site lives at ./site/. ALWAYS prefix shell commands with "cd site && ".

      Architecture: {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Audience psychology: {{audience_psychology}}
      Motion infrastructure installed: {{motion_log}}
      Plan approval (user notes — incorporate any feedback): {{plan_approval}}

      If plan_approval.user_notes or plan_approval.animation_directives contain specific
      instructions, apply them during this enhancement pass before proceeding.

      ═══════════════════════════════════════════════════════════
      PHASE 0: CRITIQUE CLAUDE'S FIRST PASS
      ═══════════════════════════════════════════════════════════

      Before rewriting anything, audit the current implementation as a design critic.
      Read the homepage, header, footer, and 2-3 major sections.
      Identify:
      - where the layout is too generic
      - where the visual hierarchy is weak
      - where the implementation drifts from messaging or audience psychology
      - where the chosen concept route is not expressed clearly enough
      - which 5-8 components most need a redesign rather than a small polish
      - where the site looks statistically average or templated
      - which sections have the highest AI sameness risk

      Build a short REBUILD PRIORITIES list in memory.

      ═══════════════════════════════════════════════════════════
      PHASE 1: COMPILE THE DESIGN SYSTEM DOCUMENT
      ═══════════════════════════════════════════════════════════

      Before touching any component, read the project's actual configuration files:
      1. Read site/src/app/globals.css — extract ALL CSS custom properties (--color-*, --font-*, etc.)
      2. Read site/tailwind.config.* (if present) or site/src/app/layout.tsx — extract font names and theme config
      3. Read site/package.json — note which animation libraries are installed (framer-motion, etc.)
      4. Read the 2-3 most central layout files (Header, Footer, layout.tsx) to understand the current visual language
      5. Cross-check them against messaging and concept_direction so the rebuild follows strategy, not just existing code

      Now compose a DESIGN SYSTEM DOCUMENT — a compact reference you will pass to EVERY Gemini call.
      It must include:

      ```
      DESIGN SYSTEM:

      CSS Variables (from globals.css):
      [list every --variable-name and its value]

      Fonts:
      - Display/Heading: [exact font name as used in code]
      - Body: [exact font name]
      - Mono: [if any]

      Color Usage Rules:
      - Primary: [var name] — used for [CTAs, headings, etc.]
      - Background: [var name] — used for [page bg, card bg, etc.]
      - Accent: [var name] — used for [highlights, borders, etc.]
      - Text: [var name] — used for [body text]

      Animation Vocabulary:
      - Library available: [none / framer-motion / both]
      - Entrance style: [e.g., "fade up with 0.4s ease-out, staggered children 0.1s apart"]
      - Hover style: [e.g., "scale(1.02) + shadow elevation + border opacity"]
      - Transition timing: [e.g., "duration-300 ease-out for interactions, duration-700 for reveals"]

      Spatial Scale:
      - Section padding: [e.g., "py-24 md:py-32"]
      - Container max-width: [e.g., "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"]
      - Card padding: [e.g., "p-6 md:p-8"]
      - Grid gaps: [e.g., "gap-6 md:gap-8"]

      Visual Personality:
      [2-3 sentences describing the design direction grounded in messaging + concept direction]

      Background Treatment:
      [describe the approach — e.g., "Dark backgrounds with noise texture overlay (SVG filter),
      subtle radial gradient blooms in accent color at 8% opacity"]

      Messaging Rules:
      - Primary message: [from messaging]
      - Tone of voice: [from messaging]
      - Audience psychology cues: [what must feel true for this audience]
      - Anti-sameness rules: [from branding + concept_direction + research.ai_sameness_risks]

      Components Already Enhanced (update as you go):
      [leave blank initially — fill in after each component]
      ```

      Save this document in memory — you will pass it verbatim as the `designSystem` parameter
      to every single mcp__gemini-tools__rewrite_component call.

      ═══════════════════════════════════════════════════════════
      PHASE 2: DETERMINE ENHANCEMENT ORDER
      ═══════════════════════════════════════════════════════════

      Use Glob to list all .tsx files under:
      - site/src/components/
      - site/src/app/ (page.tsx files only, not layout)

      Order them for enhancement — process FOUNDATIONAL components first so later components
      can reference what's already been established:

      Priority order:
      1. Layout components first: Header, Footer, Navigation
      2. Hero/above-fold sections (highest visual impact, sets the tone for everything)
      3. Major page sections (Features, About, Services, Pricing, Testimonials, CTA)
      4. UI atoms last (Button, Card, Badge, Input — these should match what the sections use)
      5. Skip: layout.tsx, page.tsx root files, loading.tsx, not-found.tsx, pure data files

      ═══════════════════════════════════════════════════════════
      PHASE 3: REBUILD EACH COMPONENT
      ═══════════════════════════════════════════════════════════

      For EACH component file (in priority order):

      a. Use Read to get the current code

      b. Build `siblingsContext`: a 2-3 sentence summary of what the most visually related
         components already look like (based on what you've enhanced so far). Example:
         "Header uses dark navy bg with white text and a single amber accent CTA button with
         scale hover. Hero section has a large editorial headline with gradient text clip,
         a noise-textured background, and a fade-up entrance animation."

      c. Call mcp__gemini-tools__rewrite_component with:
         - filePath: the file path
         - code: the current TSX code
         - designPrompt: the DESIGN ENHANCEMENT INSTRUCTIONS below
         - componentContext: what this component does, which page it appears on, its role
         - designSystem: the FULL design system document from Phase 1 (pass the entire thing)
         - siblingsContext: your summary of related already-enhanced components
         - Treat Gemini as a redesign partner, not a linter. If a component needs a stronger layout,
           hierarchy, rhythm, or composition, rewrite it boldly while preserving functionality.

      d. Review the returned code CAREFULLY:
        - Verify it uses CSS variables from the design system (not hardcoded hex values)
        - Verify it uses the correct font names
        - Verify all original exports, props, and TypeScript types are preserved
        - Verify imports are correct
        - If Gemini used a font or color NOT in the design system, fix it before saving
        - Score the rebuilt component for AI sameness risk from 1-10
        - If the score is above 3, rewrite again or manually adjust before saving

      e. Use Write to save the enhanced version

      f. Update your "Components Already Enhanced" list in the design system document
         with a 1-line visual summary of what this component now looks like

      g. If Gemini returned an error or suspicious output: keep the original file, log the skip

      ═══════════════════════════════════════════════════════════
      DESIGN ENHANCEMENT INSTRUCTIONS
      (pass this as `designPrompt` to every Gemini call)
      ═══════════════════════════════════════════════════════════

      Claude already built a first-pass version of this component.
      Your job is to redesign it into a stronger second-pass component that better expresses
      the approved strategy, concept route, and audience psychology.
      You have been given the site's DESIGN SYSTEM above — follow it exactly.

      TYPOGRAPHY:
      - Use the fonts defined in the design system. Never introduce new font families.
      - Create dramatic hierarchy: display headings should feel 3-4x larger than body
      - Apply letter-spacing: -0.02em to -0.04em on headings, +0.05em to +0.1em on labels/caps
      - Use fluid sizes (clamp()) for hero headings

      COLOR:
      - Use ONLY the CSS variables from the design system. No hardcoded hex values.
      - Let one color dominate each section. Don't distribute colors evenly.
      - Use accent color for a single focal moment per component (CTA, highlight, icon accent)

      MOTION:
      - Follow the animation vocabulary from the design system exactly
      - One primary entrance animation per section (not scattered micro-animations)
      - Hover states: scale + shadow elevation is the baseline; make it feel intentional
      - Always add @media (prefers-reduced-motion: reduce) { } guard

      SPATIAL COMPOSITION:
      - Follow the spatial scale from the design system (section padding, container width)
      - Add visual interest with asymmetry where it serves the content
      - Use overlapping elements for depth (decorative shapes behind content, offset cards)

      ATMOSPHERE:
      - Follow the background treatment from the design system
      - Add decorative elements (abstract shapes, grid lines, dot patterns) that reinforce brand
      - Every section should feel distinct but unmistakably part of the same family

      NEVER:
      - Introduce colors, fonts, or animation styles not in the design system
      - Use generic AI aesthetics (purple-pink gradients, predictable card grids, drop shadows everywhere)
      - Recreate a statistically average SaaS section when the concept route calls for something more authored
      - Make adjacent sections feel interchangeable
      - Remove existing functionality, props, or TypeScript types
      - Add CSS-in-JS, CSS modules, or inline style attributes

      ALWAYS:
      - Use only Tailwind CSS classes + CSS custom properties from globals.css
      - Preserve all responsive Tailwind classes (sm:, md:, lg:)
      - Maintain WCAG AA contrast ratios
      - Keep mobile-first layout intact
      - Introduce at least one authored composition decision in every major section
      - Use hierarchy, asymmetry, contrast, and rhythm to avoid template sameness

      ═══════════════════════════════════════════════════════════
      PHASE 4: VALIDATE
      ═══════════════════════════════════════════════════════════

      After ALL components are rebuilt:
      1. Run: cd site && npx tsc --noEmit
         Fix ALL TypeScript errors — these are usually caused by Gemini changing prop types
      2. Run: cd site && npm run build
         Fix ALL build errors before moving on
      3. Do a consistency audit: read 3 random enhanced components and verify they all reference
         the same CSS variables and follow the same animation patterns
      4. Do an anti-sameness audit: read 5 major sections and verify they do not share the same
         composition recipe, hierarchy shape, or generic AI styling

      Output a summary table:
      | Component | Status | Key visual change | AI sameness risk |
      |-----------|--------|-------------------|
      | Header.tsx | ✓ Enhanced | Dark nav, amber CTA, fade-in on scroll | 2/10 |
      | ... | ... | ... |
    output_key: "design_review"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 11: Image Sourcing & Upload
  # Intelligently decides per-image whether to use real photos (web search),
  # AI generation, or AI enhancement of real reference images.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Image Generation & Upload"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 20
    prompt_template: |
      The site is built and designed in the "site/" subdirectory. Now source and upload
      all images. The site lives at ./site/. ALWAYS prefix shell commands with "cd site && ".

      Architecture (image inventory): {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Research: {{research}}
      Discovery (site_profile, project_type): {{discovery}}
      Audience psychology: {{audience_psychology}}
      Plan approval (any image directives from user): {{plan_approval}}

      ═══════════════════════════════════════════════════════════
      SKIP CHECK — READ THIS FIRST
      ═══════════════════════════════════════════════════════════

      Check discovery.site_profile.generate_images.
      If generate_images is explicitly false:
        → Output: { "skipped": true, "reason": "User opted out of AI image generation. Placeholders are already in place for the client to add their own images." }
        → Do NOT call any image generation or upload tools.
        → STOP HERE.

      If generate_images is true or not specified, proceed with the full image workflow below.

      ═══════════════════════════════════════════════════════════
      STEP 1: DECIDE THE IMAGE STRATEGY PER IMAGE
      ═══════════════════════════════════════════════════════════

      Not every image should be AI-generated. Think like a creative director choosing
      the right source for each shot. For each image in the architecture inventory, decide:

      CATEGORY A — USE REAL PHOTOS (web search + Zippy upload):
      These images need to feel real because they depict real-world places, people, or objects
      where AI generation looks uncanny or generic:
      - Specific real locations (cities, landmarks, buildings, neighborhoods)
        e.g. NYC skyline, Empire State Building, a specific beach, a neighborhood street
      - Real product/food photography where tactile realism matters
        e.g. restaurant dishes, physical products, retail items
      - Real people contexts where diversity and authenticity matter
        e.g. team photos placeholder, customer testimonial avatars
      - Architectural photography of real buildings (real estate sites)
      - Any image where the user or brief names a specific real thing

      CATEGORY B — AI GENERATE (mcp__gemini-tools__generate_and_upload_image):
      These images benefit from controlled composition and brand-color alignment:
      - Abstract/conceptual imagery (technology, data, flow, process)
      - Brand-atmosphere hero backgrounds (gradients, textures, abstract scenes)
      - Illustrated or stylized visuals (icons with depth, 3D-style product mockups)
      - Custom lifestyle scenes where you control exact lighting and color palette
      - Favicon and OG image (always AI — needs brand precision)
      - Any image that's decorative or atmospheric rather than documentary

      CATEGORY C — AI ENHANCE A REAL REFERENCE:
      Use web search to find a strong real reference, then generate an AI version
      that maintains the composition/subject but matches the brand palette:
      - A real estate hero where you need a specific type of property but with brand colors
      - A hospitality image where real food/atmosphere inspires the shot
      - A lifestyle scene where you found perfect composition but wrong color temperature

      Read plan_approval.image_directives for any specific user instructions about images.
      These override your decisions above — user guidance takes priority.

      ═══════════════════════════════════════════════════════════
      STEP 2: IMAGE STYLE DECISION
      ═══════════════════════════════════════════════════════════

      Decide the visual style for AI-generated images based on project_type:

      - creative_portfolio / agency: Stylized, bold, high-contrast. Geometric abstraction,
        dramatic lighting. NOT photorealistic unless specified.
      - saas_product / startup / corporate: Clean and professional. Abstract tech visuals,
        soft gradient backgrounds, subtle 3D product-mockup style.
      - hospitality / restaurant: Warm, appetizing, atmospheric. Photorealistic food and
        interior photography style. Golden hour lighting.
      - real_estate / luxury: Aspirational architectural photography style. Clean natural
        light, premium materials visible. Photorealistic.
      - healthcare / wellness: Soft, calm, human. Warm natural tones. Photorealistic with
        gentle lighting — never clinical.
      - personal_brand: Match the individual's personality from messaging.brand_personality and concept_direction.
      - ecommerce: Product-focused, clean white or light backgrounds. No distractions.

      ═══════════════════════════════════════════════════════════
      STEP 3: SOURCE EACH IMAGE
      ═══════════════════════════════════════════════════════════

      Process each image from the architecture inventory:

      ── FOR CATEGORY A (real photos) ──

      Use mcp__exa-search__web_search_exa to find real images:
      - Search specifically for the subject (e.g. "Empire State Building high resolution photo",
        "NYC skyline sunset professional photography", "modern luxury apartment interior")
      - Look for images from reputable sources (Unsplash alternatives, news archives,
        press/editorial photos, official tourism sites)
      - Find the direct image URL
      - Upload to Zippy using mcp__zippy-tools__upload_url:
        Pass the direct image URL. Optionally specify folder_id if a Zippy folder was created.
      - Note: Use the returned CDN URL which includes ?f=auto&q=auto for automatic optimization

      ── FOR CATEGORY B (AI generated) ──

      Use mcp__gemini-tools__generate_and_upload_image:
      - Craft a detailed prompt that includes:
        • The specific subject and composition
        • Visual style matching the project_type decision above
        • Brand colors by hex (e.g. "dominant color palette: #1a2b3c, accent #e85c2a")
        • Lighting, mood, and atmosphere descriptors
        • "Professional photography" or "digital illustration" quality markers
        • NO text in the image (text rendering is unreliable)
      - aspectRatio: correct for placement (16:9 hero, 4:3 feature, 1:1 avatar/icon, 9:16 portrait)
      - folder_id: optional Zippy folder UUID if one was created for this project

      ── FOR CATEGORY C (AI enhanced real) ──

      1. Use web search to find the reference image URL
      2. Describe what you found to use as composition inspiration
      3. Generate with mcp__gemini-tools__generate_and_upload_image using the reference
         as your composition guide but applying brand colors and style

      ═══════════════════════════════════════════════════════════
      STEP 4: SPECIAL ASSETS
      ═══════════════════════════════════════════════════════════

      FAVICON — always AI generated:
      - Bold, iconic, simple graphic representing the brand (1:1 ratio)
      - Generate with generate_and_upload_image
      - Download: cd site && curl -o src/app/icon.png "<zippy_cdn_url>"
      - Also: cd site && curl -o src/app/apple-icon.png "<zippy_cdn_url>"

      OG IMAGE — always AI generated:
      - Strong branded visual, 16:9 ratio, NO text
      - Generate with generate_and_upload_image
      - Save URL for metadata step

      ═══════════════════════════════════════════════════════════
      STEP 5: UPDATE THE CODE
      ═══════════════════════════════════════════════════════════

      For each image sourced:
      - Find the placeholder div with matching data-image attribute in site/src/
      - Replace with Next.js Image component:
        <Image src="<url>" alt="<descriptive alt text>" width={w} height={h} className="..." />
      - above-fold images: priority={true}
      - below-fold images: loading="lazy"
      - Add meaningful alt text (never "image" or "photo" — describe the actual content)
      - Ensure next.config.ts has ALL image domains in remotePatterns
        (Zippy storage.zipline.agency is set — add any other domains from real photo sources)

      ═══════════════════════════════════════════════════════════
      STEP 6: UPDATE METADATA
      ═══════════════════════════════════════════════════════════

      Update site/src/app/layout.tsx:
      - openGraph.images: [{ url: '<og-image-url>', width: 1200, height: 630 }]
      - twitter.card: 'summary_large_image'
      - twitter.images: ['<og-image-url>']
      - metadataBase: new URL('https://your-domain.com')

      ═══════════════════════════════════════════════════════════
      OUTPUT
      ═══════════════════════════════════════════════════════════

      Output a log for every image:
      | Image | Category (real/AI/enhanced) | Source/Prompt | Final URL | Placed in |
    output_key: "images_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 12: Scroll Animations & Interactions Pass
  # Fully conditional on animation_approach from Step 1.
  # Immersive sites get the full choreography. Conversion sites get restraint.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Scroll Animations & Interactions"
    model: "claude-sonnet-4-6"
    effort: "high"
    max_budget_usd: 7
    max_turns: 15
    prompt_template: |
      The site is visually enhanced and has real images. Now add the scroll animations
      and interactions appropriate for this site's type and goals.
      The site lives at ./site/. ALWAYS prefix shell commands with "cd site && ".

      Branding: {{branding}}
      Architecture: {{architecture}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Motion infrastructure (installed in Step 9): {{motion_log}}
      Design system applied: {{design_review}}
      Research (tech_stack decisions): {{research}}
      Discovery (site_profile): {{discovery}}
      Audience psychology: {{audience_psychology}}
      Plan approval (user animation notes): {{plan_approval}}

      If plan_approval.animation_directives is non-empty, apply those changes.
      User-specified animation preferences override the default choreography below.

      ═══════════════════════════════════════════════════════════
      FIRST: READ THE ANIMATION APPROACH
      ═══════════════════════════════════════════════════════════

      Read motion_log to know exactly which primitives were installed.
      Read research.tech_stack.animation_approach to know the approach.
      Then follow ONLY the path below that matches.

      ═══════════════════════════════════════════════════════════
      ══ PATH A: css_only ══
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "css_only":

      The site uses CSS transitions + IntersectionObserver (FadeIn component from Step 9).
      DO NOT add any JavaScript animation libraries.

      Your job here is to wire the FadeIn component onto the right elements:
      1. Read every page and component file
      2. Wrap section headings and key content blocks in <FadeIn> with appropriate delays
      3. Use delay staggering: first element delay=0, second delay=0.1, third delay=0.15
      4. Add CSS hover states to any card or interactive element that doesn't have them yet:
         - Cards: hover:shadow-md transition-shadow duration-200
         - Buttons: hover:brightness-110 active:scale-95 transition-all duration-150
         - Links: hover:opacity-80 transition-opacity duration-150
      5. Verify no horizontal overflow, no layout shift

      DO NOT add: magnetic buttons, scroll progress bar, parallax, loading screen.
      These add JavaScript overhead and distraction on conversion-focused sites.

      VALIDATE: npm run build + npx tsc --noEmit.
      Output: list of elements wrapped in FadeIn, CSS classes added.

      ═══════════════════════════════════════════════════════════
      ══ PATH B: framer_only ══
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "framer_only":

      Available: Reveal, StaggerChildren (from Step 9), framer-motion, standard browser scroll.

      ── GEMINI ANIMATION PLANNING ──
      Call mcp__gemini-tools__generate_content:
      "You are a frontend motion designer. This is a [project_type] site with primary_goal=[primary_goal].
      The animation approach is framer_only — NO Lenis, NO GSAP. Pure Framer Motion only.
      Design restrained, purposeful scroll animations. Nothing that distracts from [primary_goal].
      Branding: [paste {{branding}}]. Architecture: [paste {{architecture}}].
      For each section, specify: animation type (Reveal/StaggerChildren/none), timing, trigger, hover behavior.
      Available: Reveal, StaggerChildren, framer-motion whileHover, whileTap.
      Output as a structured spec."

      ── IMPLEMENT ──
      For each section/component:
      1. HERO: Reveal for headline (direction="up"), delayed Reveal for subhead,
         Framer Motion whileInView for CTA buttons (no spring physics here — fast and clear)
      2. FEATURE CARDS: StaggerChildren with stagger=0.08 (faster than creative sites)
      3. TESTIMONIALS: Reveal direction="none" (pure fade)
      4. EVERY CTA BUTTON: whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      5. ABOUT/TEAM: Reveal from appropriate directions

      DO NOT add: Lenis smooth scroll, GSAP pinned sections, custom cursor,
      magnetic buttons (too gimmicky for this site type), parallax effects by default.
      Exception: allow only if package selection explicitly included it and rationale
      ties directly to site goals without degrading usability/performance.

      VALIDATE: npm run build + npx tsc --noEmit.

      ═══════════════════════════════════════════════════════════
      ══ PATH C: gsap_framer ══
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "gsap_framer":

      Available: Reveal, StaggerChildren, GSAP ScrollTrigger (no Lenis), standard browser scroll.

      ── GEMINI ANIMATION PLANNING ──
      Call mcp__gemini-tools__generate_content:
      "You are a frontend motion designer. This is a [project_type] site.
      Animation stack: GSAP ScrollTrigger + Framer Motion. Standard browser scroll (no Lenis).
      Motion intensity should be MODERATE — professional and purposeful, not flashy.
      Branding: [paste {{branding}}]. Architecture: [paste {{architecture}}].
      For each section: animation type, timing, trigger. Flag which sections warrant GSAP vs Framer Motion.
      Output as a structured spec."

      ── IMPLEMENT ──
      1. HEADER: GSAP ScrollTrigger for background blur/shadow after 80px scroll
         gsap.to(headerEl, { backdropFilter: 'blur(8px)', scrollTrigger: { start: '80px top', toggleActions: 'play none none reverse' } })
      2. HERO: Reveal for headline, StaggerChildren for feature highlights if any
      3. FEATURE/SERVICE SECTIONS: StaggerChildren (stagger=0.10)
      4. STATISTICS / NUMBERS: GSAP counter animation (counts from 0 on viewport enter)
         — this is the one "wow moment" appropriate for this site type
      5. TESTIMONIALS: Reveal direction="none"
      6. CTA SECTIONS: Framer Motion whileHover on primary button only
      7. FOOTER: Reveal for brand name/logo

      DO NOT add: Lenis, custom cursor, magnetic buttons, pinned scroll sections,
      ParallaxLayer (unless site_profile.parallax = "subtle" — then hero only).
      If parallax = "subtle": wrap hero image in ParallaxLayer with speed=0.1 only.
      Optional libraries selected in research.tech_stack.packages_to_install can be used
      only with explicit rationale and mobile/perf safeguards.

      VALIDATE: npm run build + npx tsc --noEmit.

      ═══════════════════════════════════════════════════════════
      ══ PATH D: gsap_lenis_framer ══
      ═══════════════════════════════════════════════════════════

      IF animation_approach = "gsap_lenis_framer":

      Full immersive stack available. The scroll experience IS the product.
      Available: Reveal, StaggerChildren, ParallaxLayer (if parallax != "none"),
      SmoothScrollProvider (Lenis), CustomCursor, GSAP ScrollTrigger, framer-motion.
      You may also use optional motion utilities only if they were selected in
      research.tech_stack.packages_to_install and fit brand/goal requirements.

      ── GEMINI ANIMATION PLANNING ──
      Call mcp__gemini-tools__generate_content:
      "You are an award-winning frontend motion designer specializing in GSAP, Framer Motion, and Lenis.
      This is a [project_type] site — motion IS the statement. Create a complete ANIMATION CHOREOGRAPHY PLAN.
      Branding: [paste {{branding}}]. Architecture: [paste {{architecture}}].
      Available: Reveal, StaggerChildren, ParallaxLayer (parallax=[parallax value]),
      MagneticButton, ScrollProgress, GSAP ScrollTrigger, framer-motion useScroll/useTransform/useSpring.
      For each section: exact animation type, timing (duration/delay/stagger/easing), trigger,
      interaction (hover/click), 1-2 wow moments per page, mobile behavior.
      Output as a structured spec I can implement line by line."
      Save Gemini's plan and implement it exactly.

      ── IMPLEMENT — every page and section ──

      1. HERO (highest priority — first impression):
         - Headline: kinetic text reveal — each word/line fades up with stagger (0.08s apart)
         - Subheadline: delayed fade-up after headline completes
         - CTA buttons: slide in from below with spring physics
         - Hero image: ParallaxLayer with speed=0.15 (subtle downward parallax on scroll)
         - Background decoratives: counter-parallax (speed -0.1) for depth

      2. NAVIGATION / HEADER:
         - GSAP ScrollTrigger scroll-shrink + blur after 80px
         - Nav links stagger on load (0.05s)
         - Active link sliding underline

      3. FEATURE/SERVICES:
         - Section title: Reveal direction="up"
         - Cards: StaggerChildren stagger=0.12
         - Hover: translateY -4px + shadow elevation

      4. ABOUT / STORY:
         - Split layout: text Reveal from left, image Reveal from right
         - Statistics: GSAP counter (0 → final value)
         - Team photos: ParallaxLayer speed=0.2, hover scale

      5. TESTIMONIALS:
         - Quote: Reveal direction="none" (editorial fade)
         - If carousel: Framer Motion drag-to-scroll with momentum

      6. CTA / PRICING:
         - GSAP ScrollTrigger pin (hold for 0.5 viewport heights)
         - Price counter animation
         - MagneticButton wrapper on primary CTAs

      7. FOOTER:
         - Brand name: monumental Reveal direction="up"
         - Links: StaggerChildren stagger=0.04

      8. SCROLL PROGRESS BAR:
         Create site/src/components/ui/ScrollProgress.tsx:
         ```tsx
         'use client';
         import { motion, useScroll, useSpring } from 'framer-motion';
         export function ScrollProgress() {
           const { scrollYProgress } = useScroll();
           const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
           return <motion.div style={{ scaleX, transformOrigin: 'left' }}
             className="fixed top-0 left-0 right-0 h-[2px] bg-[var(--color-accent)] z-[100]" />;
         }
         ```
         Add to layout.tsx.

      9. MAGNETIC BUTTONS:
         Create site/src/components/ui/MagneticButton.tsx using Framer Motion
         useMotionValue + useSpring + onMouseMove/onMouseLeave. Wrap primary CTAs only.

         CRITICAL PERFORMANCE RULE: NEVER use React useState for magnetic hover or any
         continuous mouse-tracking animation. useState causes a full React re-render on every
         mousemove event (60fps), which collapses performance on mobile and mid-range devices.
         ALWAYS use Framer Motion's useMotionValue and useTransform — these operate outside
         the React render cycle and update via direct DOM mutation at 60fps with zero re-renders.

         Correct pattern:
         ```tsx
         'use client';
         import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion';
         // x and y are MotionValues — they NEVER trigger re-renders
         const x = useMotionValue(0);
         const y = useMotionValue(0);
         const springX = useSpring(x, { stiffness: 150, damping: 20 });
         const springY = useSpring(y, { stiffness: 150, damping: 20 });
         // onMouseMove: call x.set() and y.set() — no setState, no re-render
         ```

         Also: MagneticButton is desktop-only. Add a pointer: fine media query check and
         skip the magnetic behavior entirely on touch devices.

      10. SECTION TRANSITIONS: Decorative separators or background overlaps between major sections.

      ── RULES ──
      - Use Reveal/StaggerChildren/ParallaxLayer — don't reinvent them
      - 'use client' on every component that uses hooks or motion
      - All GSAP: inside useEffect with cleanup
      - Every animation: prefers-reduced-motion guard
        (Framer Motion: useReducedMotion hook; GSAP: window.matchMedia check)
      - Coherent over quantity: 6 timed animations > 20 scattered ones
      - Mobile: disable parallax on mobile (check matchMedia('(max-width: 768px)'))
        Magnetic buttons: desktop only (pointer: fine check)

      ═══════════════════════════════════════════════════════════
      VALIDATE (all paths)
      ═══════════════════════════════════════════════════════════
      - Run: cd site && npx tsc --noEmit (fix all errors)
      - Run: cd site && npm run build (fix all build errors)

      Output a log of every animation/interaction added, by section.
    output_key: "motion_interactions_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 13: SEO Optimization (Sonnet 4.6 — systematic SEO implementation)
  # ═══════════════════════════════════════════════════════════════════════
  - name: "SEO Optimization"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 12
    prompt_template: |
      The site is built, designed, and has real images. It lives in the "site/" subdirectory.
      IMPORTANT: All file paths are under ./site/. When running shell commands, prefix with "cd site && ".

      Architecture: {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}

      Use mcp__exa-search__get_code_context_exa to research the latest Next.js metadata API
      and SEO patterns if needed.

      IMPLEMENT EVERY ITEM ON THIS CHECKLIST:

      1. METADATA (every page)
         - Create a site/src/lib/metadata.ts utility that generates metadata objects
         - Every page gets: unique title (using template "%s | Brand Name"), description (120-160 chars),
           canonical URL, OpenGraph tags (title, description, url, image, type), Twitter Card tags
         - Root layout gets: metadataBase, default title, keywords, authors, creator, publisher, robots
         - Blog posts (if any) get: publishedTime, modifiedTime, authors, article section

      2. STRUCTURED DATA (JSON-LD)
         - Create a site/src/components/seo/JsonLd.tsx component
         - Add Organization schema to root layout
         - Add WebSite schema with SearchAction to root layout
         - Add BreadcrumbList schema to pages with breadcrumbs
         - Add FAQPage schema to FAQ page (if exists)
         - Add BlogPosting schema to blog posts (if any)
         - Escape HTML entities in JSON-LD (replace < and > with unicode escapes)

      3. SITEMAP
         - Create site/src/app/sitemap.ts with dynamic generation
         - Include all static and dynamic pages
         - Set proper priorities (homepage=1.0, main pages=0.8, content=0.6)
         - Set proper changeFrequency values

      4. ROBOTS
         - Create site/src/app/robots.ts
         - Allow all crawlers on public pages
         - Disallow /api/ routes
         - Reference sitemap URL

      5. HEADING HIERARCHY
         - Verify every page has exactly ONE h1
         - Verify h2-h6 are nested logically (no skipped levels)
         - Fix any violations

      6. SEMANTIC HTML
         - Verify main, section, article, nav, header, footer are used correctly
         - Add aria-label to navigation elements
         - Add aria-current="page" to active nav links

      7. IMAGE SEO
         - Verify every image has descriptive alt text (not "image" or empty)
         - Verify decorative images have alt=""

      8. INTERNAL LINKING
         - Ensure navigation links to all main pages
         - Add related content links where appropriate
         - Add breadcrumb navigation to sub-pages

      9. SECURITY HEADERS (for SEO trust signals)
         - Add to next.config: Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options,
           Referrer-Policy, Permissions-Policy headers

      After implementing everything, output a checklist with pass/fail for each item.
    output_key: "seo_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 14: Performance & Mobile Optimization (Sonnet 4.6)
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Performance & Mobile Optimization"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 15
    prompt_template: |
      The site is feature-complete. It lives in the "site/" subdirectory.
      IMPORTANT: All file paths are under ./site/. When running shell commands, prefix with "cd site && ".

      Architecture: {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}

      Use mcp__exa-search__get_code_context_exa to research Next.js 15+ performance
      patterns and optimizations if needed.

      PERFORMANCE CHECKLIST:

      1. IMAGE OPTIMIZATION
         - All images use Next.js <Image> component (not <img>)
         - Above-fold images have priority={true}
         - Below-fold images have loading="lazy"
         - Images have proper width, height, and sizes attributes
         - Configure next.config with image formats: ['image/avif', 'image/webp']
         - Set minimumCacheTTL: 31536000 (1 year)

      2. FONT OPTIMIZATION
         - All fonts loaded via next/font/google with display: 'swap'
         - Font subsets specified (at minimum: 'latin')
         - Font variables used in Tailwind config
         - No external font CSS links in head

      3. CODE SPLITTING
         - Heavy components use dynamic(() => import(...)) with loading fallbacks
         - Client components are minimal — prefer Server Components
         - Remove any 'use client' directives that aren't necessary

      4. BUNDLE OPTIMIZATION
         - Add to next.config experimental.optimizePackageImports for large libraries
           (lucide-react, framer-motion, etc.)
         - Remove unused dependencies from package.json
         - Remove console.log statements

      5. CACHING HEADERS
         - Add Cache-Control headers in next.config for static assets (1 year, immutable)
         - Add proper cache headers for images

      6. RESOURCE HINTS
         - Add preconnect for external domains (Google Fonts, Zippy CDN storage.zipline.agency, analytics)
         - Add dns-prefetch for secondary domains

      MOBILE OPTIMIZATION CHECKLIST:

      7. RESPONSIVE DESIGN AUDIT
         - Verify all pages look correct at 375px, 768px, 1024px, 1440px widths
         - Check that text is readable at all sizes
         - Check that touch targets are at least 44x44px
         - Check that spacing is appropriate on mobile (not too cramped, not too sparse)

      8. MOBILE NAVIGATION
         - Ensure hamburger menu works correctly on mobile
         - Menu should be full-screen overlay or slide-in panel
         - Close on link click and outside click

      9. MOBILE CTA
         - Add a sticky mobile CTA bar at the bottom (visible on mobile only)
         - Include primary action (Contact/CTA) and secondary (WhatsApp/Phone if applicable)
         - Use safe-area-inset-bottom for notched devices
         - The CTA bar height should be ~4rem (h-16). Use a CSS variable if needed.
         - IMPORTANT: The hero section already has pb-20 md:pb-0 to account for this bar.
           Verify that hero content (headline + CTA) is fully visible ABOVE the sticky bar
           on a 375px viewport. If content is cut off, adjust hero padding.
         - Consider hiding the sticky CTA bar while the hero is in viewport (to avoid
           duplicate CTAs) using IntersectionObserver — show it only after scrolling past hero.

      10. TOUCH OPTIMIZATION
          - Add touch-action: manipulation globally
          - Remove any hover-dependent functionality on mobile
          - Ensure form inputs have appropriate mobile keyboard types

      11. VIEWPORT
          - Verify viewport meta tag: width=device-width, initial-scale=1, maximum-scale=5
          - No horizontal scroll on any page at any size

      12. NATIVE APP FEEL
          - Smooth scrolling
          - Fast transitions between pages (consider view transitions if supported)
          - No layout shift on page load (reserve space for images, fonts)
          - Active states on buttons for touch feedback

      13. WEB APP MANIFEST
          - Create public/manifest.json with name, short_name, theme_color, background_color, icons
          - Add <link rel="manifest" href="/manifest.json"> to layout.tsx
          - Add theme-color meta tag matching the brand primary color

      14. FINAL CONTENT REVIEW
          - Read through ALL visible text on every page
          - Fix any placeholder text that slipped through ("Lorem ipsum", "[Company]", "TODO", etc.)
          - Ensure the messaging tone is consistent across all pages
          - Check that CTAs are compelling and action-oriented
          - Verify all internal links point to existing pages (no dead links)

      FINAL VERIFICATION:
      - Run: cd site && npm run build
      - Fix ALL warnings and errors
      - Verify the build succeeds cleanly
      - Run: cd site && npx tsc --noEmit
      - Fix any remaining TypeScript issues

      Output a performance report with each item checked and any issues found/fixed.
    output_key: "perf_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 15: Final Audit & Polish (Opus 4.6)
  # The human-level QA pass that catches everything the automated steps miss.
  # Content quality, animation coherence, cross-page consistency, dead links,
  # placeholder text hunt, animation performance audit, and award-readiness
  # checklist.
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Final Audit & Polish"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 15
    prompt_template: |
      You are doing the final quality audit on a website before it goes live.
      Your job is to find and fix EVERYTHING that would make a design award judge say "no."
      The site lives at ./site/. ALWAYS prefix shell commands with "cd site && ".

      Branding: {{branding}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Architecture: {{architecture}}
      Motion log: {{motion_interactions_log}}

      ═══════════════════════════════════════════════════════════
      AUDIT 1: PLACEHOLDER HUNT (zero tolerance)
      ═══════════════════════════════════════════════════════════

      Run these searches and fix every result:
      - cd site && grep -r "Lorem ipsum" src/ --include="*.tsx" --include="*.ts" -l
      - cd site && grep -r "\[Company\]\|\[Your\]\|\[TODO\]\|placeholder\|coming soon\|TBD\|FIXME\|INSERT" src/ --include="*.tsx" -i -l
      - cd site && grep -r "example\.com\|test@\|foo@\|bar@" src/ --include="*.tsx" -l
      - cd site && grep -r "123-456-7890\|555-" src/ --include="*.tsx" -l

      Read each flagged file. Replace every placeholder with real, specific, brand-appropriate content.

      ═══════════════════════════════════════════════════════════
      AUDIT 1B: AI DESIGN TELLS HUNT
      ═══════════════════════════════════════════════════════════

      These are statistical patterns AI systems produce by default. Hunt and fix all of them:

      COPY TELLS — search and rewrite:
      - cd site && grep -r "Elevate\|Seamless\|Unleash\|Next-Gen\|Cutting-edge\|Streamline\|Empower\|Transform\|Revolutionize" src/ --include="*.tsx" -l
        → Replace with concrete, specific verbs that describe what the product actually does
      - Check all statistics/numbers: are they suspiciously round? (99.99%, 50%, 10,000)
        → Replace with organic-looking figures (99.97%, +47%, 8,400+)
      - Check all person names in testimonials/team sections: are they generic? ("John Doe", "Jane Smith")
        → Replace with specific, realistic names from diverse backgrounds

      LAYOUT TELLS — verify these are not present:
      - cd site && grep -r "h-screen" src/ --include="*.tsx" -l
        → Every instance must be min-h-\[100dvh\] — h-screen breaks on iOS Safari
      - cd site && grep -r "calc(33%\|w-1/3\|w-\[33" src/ --include="*.tsx" -l
        → Replace flex percentage layouts with CSS Grid
      - Visually inspect: is there a section with 3 perfectly equal cards in a row?
        → Redesign to zig-zag, asymmetric, or bento layout

      ANIMATION TELLS — verify:
      - cd site && grep -r "animate-.*top\|animate-.*left\|animate-.*width\|animate-.*height" src/ --include="*.tsx" -l
        → Animations must only use transform and opacity — never layout properties
      - Check any infinite/looping animations: are they isolated in their own React.memo component?
        → If not, extract them to prevent parent re-renders

      VISUAL SAMENESS TELLS — inspect and fix:
      - Are multiple sections using the same exact badge/headline/body/buttons/card recipe?
        → Redesign at least one of them so the page has authored variation
      - Are there multiple pages that feel like the same template with only copy changed?
        → Introduce page-specific composition and proof emphasis
      - Is there any default purple/blue gradient, generic dark SaaS hero, or floating blob background
        without strategic justification?
        → Replace it with concept-specific art direction
      - Are feature, testimonial, or pricing sections relying on interchangeable rounded cards with equal weight?
        → Introduce hierarchy, asymmetry, contrast, or grouping
      - Does any page feel polished-but-anonymous?
        → Strengthen point of view using messaging, concept route, and category-specific proof

      ═══════════════════════════════════════════════════════════
      AUDIT 2: CONTENT QUALITY REVIEW
      ═══════════════════════════════════════════════════════════

      Read every page file (app/**/page.tsx). For each page:
      - Is the headline compelling and specific? (not generic "Welcome to our website")
      - Is the body copy specific to this brand? (not could-be-anyone copy)
      - Are CTAs action-oriented and specific? ("Start your free trial" not just "Get started")
      - Are there enough words? (pages shouldn't feel thin)
      - Does the messaging tone feel consistent across pages?

      Fix any content that feels generic, thin, or off-brand. Rewrite copy where needed.

      ═══════════════════════════════════════════════════════════
      AUDIT 3: NAVIGATION & LINKS
      ═══════════════════════════════════════════════════════════

      Read the Header component. Verify every nav link:
      - Points to a real page that exists (check that the app/ directory has the route)
      - Has the correct href (no dead routes, no "#" placeholders)
      - Has active state styling
      - Works on mobile (hamburger menu, if applicable)

      Read the Footer component. Verify:
      - All links are real
      - Social media links have real hrefs (or are clearly marked as "coming soon" not "#")
      - Copyright year is correct (2026)
      - Legal pages (Privacy Policy, Terms) exist or are clearly noted as needed

      Check all CTA buttons across all pages — none should have href="#" unless they're intentional anchors.

      ═══════════════════════════════════════════════════════════
      AUDIT 4: ANIMATION COHERENCE REVIEW
      ═══════════════════════════════════════════════════════════

      Read 5 random component files that have animations. Check:
      - Do they use the same easing curve? (should be [0.22, 1, 0.36, 1] or equivalent)
      - Are durations consistent? (0.4-0.7s for reveals, 0.2-0.3s for micro-interactions)
      - Is there a consistent stagger pattern? (0.08-0.12s between children)
      - Do animations feel too heavy or too subtle anywhere?
      - Are there any animations that fight each other?

      Fix any inconsistencies. The animations should feel like one choreographer directed them all.

      Check that ALL animated components have prefers-reduced-motion handling:
      - Framer Motion: uses `useReducedMotion()` hook or respects it automatically
      - GSAP: has `if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)` guards
      - Add any missing guards

      ═══════════════════════════════════════════════════════════
      AUDIT 5: VISUAL CONSISTENCY
      ═══════════════════════════════════════════════════════════

      Read globals.css and the header + 4 random page sections. Check:
      - Is the color palette consistent? (no rogue hardcoded hex values outside CSS vars)
      - Is the spacing consistent? (same container width used everywhere)
      - Are font sizes consistent with the type scale?
      - Are border radii consistent? (not mix of rounded-lg and rounded-xl arbitrarily)
      - Are button styles consistent across all pages?

      Fix any visual inconsistencies found.

      ═══════════════════════════════════════════════════════════
      AUDIT 5B: AI SAMENESS RISK SCORE
      ═══════════════════════════════════════════════════════════

      Score the homepage and 3 key internal pages from 1-10 on AI sameness risk:
      - 1 = clearly authored, specific, and distinctive
      - 10 = obviously generic, templated, or AI-looking

      For any page scoring above 3:
      - identify exactly why
      - redesign the weakest section(s)
      - re-score after the fix

      ═══════════════════════════════════════════════════════════
      AUDIT 6: MOBILE EXPERIENCE
      ═══════════════════════════════════════════════════════════

      Read every page component. For each, verify:
      - Text is readable at 375px (no text smaller than 14px except labels/captions)
      - Images have proper sizes attribute for mobile (e.g., sizes="(max-width: 768px) 100vw, 50vw")
      - The custom cursor is hidden on mobile (touch devices)
      - The loading screen works on mobile
      - Touch targets are ≥44px (buttons, nav links, form inputs)
      - No horizontal overflow at mobile width
      - Animations have reduced complexity on mobile where needed
        (parallax effects should be disabled or reduced on mobile — they cause jank)

      Fix any mobile issues found. Parallax: wrap in `hidden md:block` or check matchMedia.

      ═══════════════════════════════════════════════════════════
      AUDIT 7: ACCESSIBILITY
      ═══════════════════════════════════════════════════════════

      Check across all components:
      - Every image has descriptive alt text
      - All interactive elements are keyboard-focusable (not just mouse-only)
      - Focus states are visible (not removed with outline-none without alternative)
      - Modals/overlays trap focus and can be closed with Escape
      - Custom cursor doesn't break keyboard navigation (it's purely decorative)
      - Color contrast meets WCAG AA (check text on colored backgrounds)
      - Animated elements don't flash more than 3 times per second (seizure risk)

      ═══════════════════════════════════════════════════════════
      AUDIT 8: AWARD-READINESS CHECKLIST
      ═══════════════════════════════════════════════════════════

      Self-assess the site against this checklist. For each item, score PASS / PARTIAL / FAIL,
      then fix any PARTIAL or FAIL items:

      VISUAL IDENTITY
      □ Distinctive typography that feels intentional and memorable
      □ Color palette that's specific and not generic (no purple-blue gradients on white)
      □ Consistent visual rhythm throughout
      □ Photography/imagery that matches brand tone

      MOTION & INTERACTION
      □ Smooth scroll (Lenis) working
      □ Custom cursor functioning on desktop
      □ Page transitions working (AnimatePresence)
      □ Loading sequence functioning
      □ Hero has orchestrated entrance animation
      □ Scroll reveals on all major sections
      □ At least one "wow" moment (pinned scroll, counter animation, parallax depth, etc.)
      □ Magnetic CTA buttons
      □ Hover states on all interactive elements feel premium

      CONTENT
      □ Zero placeholder text anywhere
      □ Every headline is specific and compelling
      □ Copy has consistent messaging tone
      □ CTAs are clear and action-oriented

      TECHNICAL
      □ Build passes clean (no warnings)
      □ All links functional
      □ Mobile-responsive at 375px, 768px, 1024px
      □ prefers-reduced-motion respected
      □ Loading screen graceful
      □ No console errors

      If anything is FAIL or PARTIAL, fix it before marking this step complete.

      ═══════════════════════════════════════════════════════════
      FINAL BUILD
      ═══════════════════════════════════════════════════════════

      After all fixes:
      - Run: cd site && npm run build 2>&1
      - Fix ALL errors and warnings
      - Run: cd site && npx tsc --noEmit
      - Fix ALL TypeScript errors

      Output the final audit report with scores for each section,
      a list of everything that was fixed, the AI sameness scores before/after, and a final readiness verdict.
    output_key: "audit_log"

  # ═══════════════════════════════════════════════════════════════════════
  # STEP 16: Finalize GitHub Handoff (Sonnet 4.6)
  # ═══════════════════════════════════════════════════════════════════════
  - name: "Finalize GitHub Handoff"
    model: "claude-sonnet-4-6"
    max_budget_usd: 5
    max_turns: 12
    prompt_template: |
      The site is complete, audited, and ready to deploy. It lives in the "site/" subdirectory.

      Architecture: {{architecture}}
      Branding: {{branding}}
      Messaging architecture: {{messaging}}
      Approved concept direction: {{concept_direction}}
      Audit report: {{audit_log}}
      Images log: {{images_log}}
      SEO log: {{seo_log}}

      Follow these steps exactly:

      1. PRE-DEPLOY BUILD VERIFICATION
         - Run: cd site && npm run build 2>&1
         - If the build FAILS:
           a. Read the full error output carefully
           b. Fix every error (TypeScript type errors, missing imports, invalid JSX, etc.)
           c. Re-run: cd site && npm run build 2>&1
           d. Repeat until the build succeeds cleanly — do NOT deploy a broken build
         - Run: cd site && npx tsc --noEmit 2>&1 (fix any remaining TS errors)

      2. GITHUB HANDOFF — EXACTLY ONE PRIVATE REPOSITORY
         Rules:
         - This project must end in exactly ONE GitHub repo, always PRIVATE. Never create a second repo for fixes or "step" pushes.
         - Never call github_create_repo more than once; if it reports the repo already exists, only add commits (git or github_push_files) to that repo.
         - github_push_files: same owner/repo every time — each call is one new commit, not a new repository.
         - Prefer one clean flow: local commits in site/, then one private remote, then push main.

         - cd into the site/ directory first
         - Check if git is already initialized: cd site && git status 2>&1
         - If already a git repo with remote origin pointing at GitHub:
           - cd site && git add -A && (git diff --cached --quiet || git commit -m "Final: <company-name> website — built by Witz WB2") && git push origin main
         - If git exists but has NO remote (or no GitHub remote yet):
           - Ensure all changes are committed locally first.
           - Create ONE new PRIVATE GitHub repository (choose one approach, not both):
             A) github_create_repo with isPrivate true (default) for name <company-slug>-website-{{_project_id}} (sanitize slug; use full {{_project_id}} for uniqueness), then:
                cd site && git remote add origin <clone_url_from_tool> && git branch -M main && git push -u origin main
             B) OR: cd site && gh repo create <company-slug>-website-{{_project_id}} --private --source=. --remote=origin --push
           - Never run gh repo create or github_create_repo twice for this project.
         - If NOT a git repo at all:
           - cd site && git init && (add .gitignore if missing) && git add -A && git commit -m "Initial commit: <company-name> website — built by Witz WB2"
           - Then create ONE private remote as in (A) or (B) above and push main once.
         - If GitHub CLI or API fails, output manual instructions (still: one private repo only).

         {{#if _git_repo_url}}The checkpoint repo is already at: {{_git_repo_url}}{{/if}}

      3. NO PLATFORM DEPLOYMENT IN THIS STEP
         - Do NOT run Vercel CLI in this workflow.
         - Do NOT create or modify Vercel projects.
         - Deployment is handled manually by the user after handoff.
         - Ensure the repo is fully pushed to main and ready for manual import/deploy.

      4. HANDOFF REPORT
         Create a comprehensive handoff-report.md with:

         # <Company Name> Website — Handoff Report

         ## Live Site
         - Production URL: [Manual deploy by user]
         - GitHub Repo: [GitHub URL]

         ## Pages Built
         [List every page with its route and description]

         ## Brand Summary
         - Colors: [primary, secondary, accent hex values]
         - Fonts: [display font, body font]
         - Tone: [brand tone description from messaging]
         - Positioning: [one-paragraph positioning summary]
         - Chosen Concept Route: [selected_route_name + summary]

         ## Images Generated
         [List every Zippy CDN image URL with its purpose]

         ## SEO Implementation
         - Metadata: [pass/fail]
         - Structured Data: [schemas implemented]
         - Sitemap: [yes/no]
         - Robots.txt: [yes/no]
         - Security Headers: [yes/no]

         ## Performance
         - Build status: [clean/warnings]
         - Image optimization: [yes/no]
         - Font optimization: [yes/no]
         - Mobile optimization: [yes/no]

         ## Models Used
         - Research: Claude Opus 4.6
         - Audience Psychology: Claude Sonnet 4.6
         - Positioning & Messaging: Claude Opus 4.6
         - Concept Routes: Claude Sonnet 4.6
         - Visual Identity: Claude Sonnet 4.6
         - Architecture & Build: Claude Opus 4.6
         - Motion Infrastructure: Claude Sonnet 4.6
         - Gemini Rebuild Pass: Gemini 3.1 Pro (via Sonnet orchestration)
         - Scroll Animation Planning: Gemini 3.1 Pro
         - Scroll Animation Implementation: Claude Sonnet 4.6
         - Image Generation: Gemini 3 Pro Image
         - SEO, Performance & Final Audit: Claude Sonnet 4.6

         ## Next Steps / Recommendations
         [Actionable suggestions for the client]

      Output the live URL and GitHub repo URL prominently.
      If no live URL exists yet, explicitly write: "Deployment is intentionally manual."
    output_key: "handoff"

system_prompt: |
  You are the Witz Website Builder V2 agent — an award-caliber, multi-model website builder
  that adapts its strategy, positioning, messaging, design philosophy, animation stack,
  and visual language to each site's type, goals, audience, and buyer psychology.
  You do not apply the same template to every site. You think strategically before you design.

  THE CORE PRINCIPLE:
  Every design and technology decision must serve the site's PRIMARY GOAL, PROJECT TYPE,
  AUDIENCE PSYCHOLOGY, and MESSAGE HIERARCHY.
  A conversion-optimized SaaS page looks nothing like a creative portfolio.
  A corporate B2B site looks nothing like a luxury hospitality brand.
  A real estate site is NOT the place for Lenis smooth scroll and custom cursors.
  The right site for a given client is the BEST possible site for THEM — not the most
  visually impressive site regardless of context.

  THE 17-STEP PIPELINE YOU EXECUTE:
  0. Research & Plan — company/competitor/trend research + preliminary tech stack (Opus)
  1. Discovery & Questions — confirm primary goal, site profile, must-haves, image preference (Sonnet)
  2. Audience & Psychology — ask 3 focused questions about decision triggers, trust barriers, and emotional targets (Sonnet)
  3. Brand Positioning & Message Architecture — define positioning, hierarchy, tone of voice, and hero messaging (Opus)
  4. Concept Routes & Approval — create 3 strategic design routes and get the user to choose one (Sonnet)
  5. Visual Identity — colors, typography, border_radius, spacing, motifs calibrated to strategy (Sonnet)
  6. Plan Review — final approval of strategy, concept route, and visual system before architecture (Sonnet)
  7. Architecture — layout philosophy driven by primary_goal, psychology, and messaging (Opus)
  8. Scaffold & Build — Claude creates the first implementation from the approved system (Opus)
  9. Motion Infrastructure — CONDITIONAL on animation_approach (Sonnet)
  10. Gemini Rebuild Pass — Gemini redesigns and rebuilds Claude's first pass into a stronger second pass (Sonnet + Gemini)
  11. Image Generation — Gemini + Zippy CDN for all images, favicon, OG (Sonnet + Gemini)
  12. Scroll Animations — CONDITIONAL on animation_approach: CSS-only polish | framer reveals |
      GSAP counters | full GSAP+Lenis choreography (Sonnet + Gemini)
  13. SEO Optimization — full metadata, JSON-LD, sitemap, robots, semantic HTML (Sonnet)
  14. Performance & Mobile — next/image, next/font, dynamic imports, mobile audit (Sonnet)
  15. Final Audit & Polish — placeholder hunt, content quality, award-readiness checklist (Sonnet)
  16. Finalize Handoff — GitHub finalized, deployment intentionally manual (Sonnet)

  ANIMATION APPROACH DECISION TREE:
  - css_only: conversion pages, e-commerce, corporate B2B, healthcare, real estate
    (motion distracts from conversion; trust > wow factor)
  - framer_only: SaaS, startup, personal brand
    (polished React animations without scroll-latency overhead)
  - gsap_framer: corporate with some motion, hospitality, professional services
    (moderate motion, no smooth scroll delay)
  - gsap_lenis_framer: creative portfolio, agency, luxury brand, editorial
    (the scroll experience IS the product — full immersive stack justified)

  STRATEGY DECISIONS:
  - audience psychology comes before visual style
  - positioning and message hierarchy come before copy polish
  - concept route approval happens before visual identity
  - Claude builds first; Gemini then rebuilds and strengthens the implementation

  VISUAL SYSTEM DECISIONS (from site_profile + concept direction):
  - border_radius: sharp (corporate/fintech) | subtle (SaaS/startup) | rounded (healthcare/wellness) | mixed (creative)
  - smooth_scroll: only for creative/luxury; false for everything else
  - custom_cursor: only for creative portfolio, agency, luxury; false for everything else
  - parallax: full (creative) | subtle (startup/hospitality hero only) | none (everything else)
  - typography: restrained & legible (corporate) | modern clean (SaaS) | atmospheric serif (hospitality/luxury) | experimental (creative)
  - color_intensity: trustworthy neutrals (B2B) | confident accents (SaaS) | bold/saturated (creative) | warm earth (hospitality)

  DESIGN TOOLS:
  - mcp__gemini-tools__rewrite_component: Gemini 3.1 Pro design enhancement (pass designSystem for consistency)
  - mcp__gemini-tools__generate_and_upload_image: Generate + upload images to Zippy CDN (ALWAYS use this)
  - mcp__gemini-tools__generate_content: General Gemini text generation
  - mcp__zippy-tools__upload_url: Upload image from URL to Zippy CDN

  RULES — NON-NEGOTIABLE:
  - Zero placeholder content. Every word is specific to this brand.
  - Never use generic fonts (Inter, Roboto, Arial, Space Grotesk, Nunito). Be distinctive.
  - Ask the audience/psychology questions before inventing positioning or style.
  - Positioning, message hierarchy, and concept route must drive build decisions.
  - Avoid the recognizable AI-built look: no default purple gradients, no repetitive equal-card grids,
    no statistically average SaaS heroes, no interchangeable sections with swapped text.
  - Every animation has prefers-reduced-motion protection (Framer: useReducedMotion; GSAP: matchMedia check).
  - Custom cursor: ONLY on creative/luxury sites AND only on desktop (pointer: fine).
  - Parallax: ALWAYS disabled on mobile regardless of site type.
  - All images through Zippy CDN (storage.zipline.agency). Never reference local image files.
  - NEVER use bare Zippy URLs — every CDN URL must include ?f=auto&q=auto at minimum.
  - Use generate_and_upload_image — never generate_image + upload_base64 (context overflow).
  - Site always lives in "site/" subdirectory. Always use "cd site && " for commands.
  - Tailwind CSS exclusively. No CSS-in-JS, no CSS modules, no inline styles.
  - 'use client' only on components that need it. Prefer Server Components.
  - Border radius from branding.border_radius_system applied CONSISTENTLY to every card, button, input.
  - Build must pass clean before deploy. Fix every error, not just the first.

  QUALITY STANDARD:
  - The best site for the client, not the most impressive site in a vacuum
  - Visitor should feel something appropriate within 2 seconds of landing
    (impressed for portfolios | trusted for corporate | excited for startups)
  - The first screen should express the positioning clearly, not just look attractive
  - The site should feel authored, specific, and intentional — not like generated template output
  - Every hover state is crafted and intentional
  - Animations serve the brand story — not decoration
  - Typography hierarchy is so clear you don't need to read to understand structure
  - Mobile experience is equally intentional, not just "not broken"

  The user provides their brief via user_prompt. Reference files may be in uploaded_files.
  Extract everything from their prompt. Use judgment for unspecified details.
