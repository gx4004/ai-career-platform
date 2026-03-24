/**
 * Hardcoded mock payloads used by the tool result preview pages.
 * These follow the same shape as the API result payloads.
 */

export const resumeMockPayload = {
  summary: {
    headline: 'Strong technical foundation with one fixable gap.',
    verdict: 'Competitive',
    confidence_note:
      'Score is heuristic and directional — not a hiring prediction. Actual recruiter decisions depend on role fit, team context, and company-specific criteria.',
  },
  overall_score: 72,
  score_breakdown: [
    { key: 'keywords', label: 'Keyword Match', score: 78 },
    { key: 'impact', label: 'Impact & Metrics', score: 65 },
    { key: 'structure', label: 'Structure', score: 82 },
    { key: 'clarity', label: 'Clarity', score: 75 },
    { key: 'completeness', label: 'Completeness', score: 60 },
  ],
  strengths: [
    '5+ years of React and TypeScript demonstrated through production deployments',
    'AWS experience tied to concrete infrastructure examples',
    'Clear job progression with increasing responsibility',
    'Quantified impact in team-lead bullet ("reduced CI time by 40%")',
  ],
  issues: [
    {
      id: 'issue-1',
      severity: 'high',
      category: 'impact',
      title: 'Work experience lacks measurable outcomes',
      why_it_matters:
        'Recruiters scan for numbers. Without metrics, strong work looks generic.',
      evidence:
        '"Built features for the payments dashboard" does not communicate scale or outcome.',
      fix: 'Rewrite as "Built 4 features in the payments dashboard, reducing checkout drop-off by 12%".',
    },
    {
      id: 'issue-2',
      severity: 'medium',
      category: 'completeness',
      title: 'No portfolio or project links visible',
      why_it_matters:
        'Senior roles expect verifiable proof. Links increase interview call rate by ~20%.',
      evidence: 'No GitHub, portfolio, or live project URLs found in resume.',
      fix: 'Add a Projects section or inline links beneath each company.',
    },
    {
      id: 'issue-3',
      severity: 'low',
      category: 'keywords',
      title: 'Kubernetes and GraphQL absent despite appearing in 70% of target JDs',
      why_it_matters: 'ATS filters remove resumes missing core stack keywords.',
      evidence: 'Neither term appears in the current resume text.',
      fix: 'Add a brief mention in a skills section or project context, e.g., "containerised with Kubernetes".',
    },
  ],
  evidence: {
    detected_sections: ['Summary', 'Experience', 'Education', 'Skills'],
    detected_skills: [
      'React', 'TypeScript', 'Node.js', 'AWS', 'Docker',
      'PostgreSQL', 'REST APIs', 'CI/CD', 'Jest', 'Git',
    ],
    matched_keywords: [
      'React', 'TypeScript', 'Node.js', 'AWS', 'REST APIs',
      'CI/CD', 'Agile', 'Docker', 'PostgreSQL',
    ],
    missing_keywords: ['Kubernetes', 'GraphQL', 'Terraform', 'Datadog'],
    quantified_bullets: 4,
  },
  top_actions: [
    {
      title: 'Add 3–4 quantified achievements',
      action:
        'Pick your most impactful bullets and add numbers: throughput, error rate improvement, team size, revenue touched.',
      priority: 'high',
    },
    {
      title: 'Include a project or portfolio link',
      action:
        'Add a GitHub profile or live project URL beneath each relevant role or in a dedicated Projects section.',
      priority: 'medium',
    },
    {
      title: 'Add Kubernetes and GraphQL to skills',
      action:
        'Weave both into an existing bullet or add a brief line in the skills section to pass ATS filters.',
      priority: 'low',
    },
  ],
  role_fit: {
    target_role_label: 'Senior Full-Stack Engineer',
    fit_score: 78,
    rationale:
      'Core stack alignment is strong. The gap is proof of senior-level scope — add metrics and project ownership language to close it.',
  },
}

export const jobMatchMockPayload = {
  summary: {
    headline: 'Strong candidate with a focused infrastructure gap.',
    verdict: 'strong',
    confidence_note:
      'Match score is heuristic. Actual interview outcomes depend on team fit, role context, and hiring manager preferences.',
  },
  match_score: 85,
  verdict: 'strong',
  requirements: [
    {
      requirement: '5+ years React/TypeScript',
      importance: 'must',
      status: 'matched',
      resume_evidence: '"Led React front-end for 3 SaaS products (2019–2024)"',
      suggested_fix: '',
    },
    {
      requirement: 'Cloud infrastructure (AWS/GCP)',
      importance: 'must',
      status: 'partial',
      resume_evidence: '"AWS EC2 and S3 usage mentioned, no infrastructure-as-code demonstrated"',
      suggested_fix: 'Add a line about Terraform or CDK usage, or describe who owned the infra.',
    },
    {
      requirement: 'GraphQL API design',
      importance: 'preferred',
      status: 'missing',
      resume_evidence: 'No GraphQL mention found.',
      suggested_fix:
        'If you have exposure, add it. If not, be ready to discuss REST-to-GraphQL tradeoffs in the interview.',
    },
    {
      requirement: 'CI/CD pipeline ownership',
      importance: 'preferred',
      status: 'matched',
      resume_evidence: '"Reduced CI build time by 40% by optimising the GitHub Actions pipeline"',
      suggested_fix: '',
    },
    {
      requirement: 'Cross-functional collaboration',
      importance: 'preferred',
      status: 'matched',
      resume_evidence: '"Worked with design, PM, and data teams across two product cycles"',
      suggested_fix: '',
    },
  ],
  matched_keywords: [
    'React', 'TypeScript', 'Node.js', 'AWS', 'REST APIs',
    'Agile', 'Git', 'CI/CD', 'PostgreSQL', 'Docker',
  ],
  missing_keywords: ['Kubernetes', 'GraphQL', 'Terraform', 'Datadog'],
  tailoring_actions: [
    {
      section: 'summary',
      keyword: 'AWS infrastructure',
      action:
        'Add one sentence: "Experienced with AWS EC2/S3 and familiar with IaC tooling for production deployments."',
    },
    {
      section: 'experience',
      keyword: 'GraphQL',
      action:
        "If you've touched it, add \"Explored GraphQL for internal tooling\" to a relevant bullet.",
    },
    {
      section: 'skills',
      keyword: 'Kubernetes',
      action: 'Add as "Kubernetes (basic)" if you have container orchestration exposure.',
    },
  ],
  interview_focus: [
    'Infrastructure ownership and cloud experience scope',
    'How you handle cross-team dependencies on a tight timeline',
    'Your approach to API design decisions (REST vs GraphQL tradeoffs)',
  ],
  recruiter_summary:
    'This candidate matches all must-have engineering requirements and most preferred ones. The main gap is demonstrable cloud infrastructure ownership — a question the recruiter will likely probe in screen. Tailoring the resume to clarify the AWS scope and adding GraphQL context would move this from a strong to a near-perfect match for this role.',
  top_actions: [
    {
      title: 'Clarify AWS ownership scope',
      action:
        'Add one line per AWS service used — distinguish between "used" vs "owned/configured". Recruiters need to know your depth.',
      priority: 'high',
    },
    {
      title: 'Add GraphQL context',
      action:
        'Even basic exposure ("explored GraphQL for internal dashboards") closes the keyword gap and avoids an automatic ATS filter.',
      priority: 'medium',
    },
    {
      title: 'Quantify CI/CD impact further',
      action:
        'The 40% build time reduction is great. Add pipeline complexity (number of services, deploy frequency) to make the scale clearer.',
      priority: 'low',
    },
  ],
}

export const interviewMockPayload = {
  summary: {
    headline: '8 likely questions generated, 3 marked practice-first.',
    verdict: 'Gap-first practice plan',
    confidence_note:
      'Questions are directional. Actual interview format depends on role, level, and interviewer preference.',
  },
  generated_at: new Date().toISOString(),
  questions: [
    {
      question: 'Walk me through a time you reduced technical debt under deadline pressure.',
      answer:
        'At my previous role, we had a payment pipeline with brittle error handling. I negotiated a 20% sprint buffer to refactor the retry logic, which reduced incident pages by 60% over two months.',
      key_points: [
        'Name the specific system and problem',
        'Quantify the business impact of the debt',
        'Show that you negotiated the time rather than just taking it',
      ],
      answer_structure: ['Situation', 'Task', 'Action', 'Result'],
      follow_up_questions: [
        'How did you get buy-in from your PM?',
        'What would you have done differently?',
      ],
      focus_area: 'Engineering craft',
      why_asked: 'Checks your ability to balance delivery with long-term code quality.',
      practice_first: true,
    },
    {
      question: 'How do you decide which parts of a system to test thoroughly vs. lightly?',
      answer:
        'I prioritise by blast radius: anything that touches payments, auth, or data consistency gets full coverage. Internal tooling and display-only paths get lighter tests. I use mutation testing occasionally to catch brittle assertions.',
      key_points: [
        'Mention a concrete risk framework (blast radius, change frequency)',
        'Give a specific example of where you applied it',
        'Show awareness of test maintenance costs',
      ],
      answer_structure: ['Framework', 'Example', 'Trade-off acknowledgement'],
      follow_up_questions: ['How do you handle flaky tests?', 'What is your view on 100% coverage?'],
      focus_area: 'Technical depth',
      why_asked: 'Checks whether you test strategically rather than mechanically.',
      practice_first: false,
    },
    {
      question: 'Tell me about a time you had to push back on a product decision.',
      answer:
        'A PM wanted to ship a feature before a database migration was stable. I flagged the risk in writing, proposed a phased rollout, and we agreed on a feature flag approach that let us ship while limiting exposure.',
      key_points: [
        'Show you flagged the risk constructively, not defensively',
        'Describe the outcome — not just your stance',
        'Make it clear you still shipped something',
      ],
      answer_structure: ['Context', 'Risk you flagged', 'Resolution', 'Outcome'],
      follow_up_questions: [
        'What would you have done if they had overruled you?',
        'How do you build trust with PMs proactively?',
      ],
      focus_area: 'Cross-functional collaboration',
      why_asked: 'Tests whether you can disagree and commit without being obstructionist.',
      practice_first: true,
    },
    {
      question: 'Describe a system you designed from scratch. What trade-offs did you make?',
      answer:
        'I designed a notification service that needed to handle 50k events/day with guaranteed delivery. I chose a queue-based approach over webhooks to decouple producers and consumers. The trade-off was added latency — acceptable for our SLA.',
      key_points: [
        'State the constraints that drove the design',
        'Name at least one explicit trade-off',
        'Show you validated the design against real requirements',
      ],
      answer_structure: ['Problem statement', 'Design choice', 'Trade-off', 'Outcome'],
      follow_up_questions: [
        'How would you scale it to 500k events?',
        'What would you change now?',
      ],
      focus_area: 'System design',
      why_asked: 'Core screen for Senior+ roles — checks architectural reasoning.',
      practice_first: true,
    },
  ],
  focus_areas: [
    {
      title: 'System design ownership',
      reason: 'Senior role requires evidence of end-to-end design, not just implementation.',
      requirements_used: ['Technical leadership', 'Architecture decisions'],
      practice_first: true,
    },
    {
      title: 'Cross-functional influence',
      reason: 'The JD explicitly mentions cross-team collaboration and stakeholder management.',
      requirements_used: ['Stakeholder communication', 'PM collaboration'],
      practice_first: false,
    },
    {
      title: 'Engineering craft',
      reason: 'Tech lead will probe for your standards around testing, code review, and tech debt.',
      requirements_used: ['Code quality', 'Testing strategy'],
      practice_first: false,
    },
  ],
  weak_signals_to_prepare: [
    {
      title: 'Infrastructure ownership',
      severity: 'high',
      why_it_matters:
        'Your resume shows AWS usage but not ownership. The interviewer will likely probe whether you configured it or just used it.',
      prep_action:
        'Prepare a 60-second answer explaining your exact scope: what you provisioned, what was handled by an ops/platform team.',
      related_requirements: ['Cloud infrastructure', 'AWS/GCP experience'],
    },
    {
      title: 'GraphQL experience',
      severity: 'medium',
      why_it_matters:
        'Preferred in the JD and not visible on your resume. A question about API design may expose this gap.',
      prep_action:
        'Be ready to articulate REST vs GraphQL trade-offs. Show you understand when GraphQL adds value, even if you haven\'t shipped it.',
      related_requirements: ['GraphQL API design'],
    },
  ],
  interviewer_notes: [
    'Prepare a short "architecture pitch" for at least one system — treat it like a 2-minute investor demo.',
    'Have 3 STAR stories memorised: one delivery win, one conflict resolution, one system design.',
    'Research the company\'s engineering blog before the interview — bring one reference.',
  ],
  top_actions: [
    {
      title: 'Prepare your system design story',
      action:
        'Write out a 2-minute pitch for one system you designed end-to-end. Include the problem, your constraints, the trade-off you made, and the result.',
      priority: 'high',
    },
    {
      title: 'Prepare your infrastructure ownership answer',
      action:
        'Have a clear, honest 60-second answer ready: "I was responsible for X; the platform team owned Y." Ambiguity here will cost you credibility.',
      priority: 'high',
    },
    {
      title: 'Research GraphQL trade-offs',
      action:
        'Read one article on REST vs GraphQL before the interview. Be ready to discuss when each is appropriate — even if you prefer REST.',
      priority: 'medium',
    },
  ],
}

export const portfolioMockPayload = {
  summary: {
    headline: '3 projects that close your senior-role proof gap.',
    verdict: 'Targeted project roadmap',
    confidence_note:
      'Project recommendations are advisory. Adjust scope and complexity based on your available time and existing portfolio.',
  },
  target_role: 'Senior Full-Stack Engineer',
  strategy: {
    headline: 'Build proof of scale, ownership, and architecture',
    focus:
      'Your technical skills are solid but your portfolio lacks evidence of senior-level scope: complex systems, infrastructure ownership, and cross-cutting concerns.',
    proof_goal:
      'Each project should demonstrate a problem you solved, a trade-off you made, and a measurable outcome — not just "I built X".',
  },
  projects: [
    {
      project_title: 'Real-time Notification Service',
      description:
        'Build a scalable notification delivery system with queue-based architecture, retry logic, and delivery guarantees. Deploy to AWS with Terraform.',
      skills: ['Node.js', 'AWS SQS', 'Terraform', 'PostgreSQL', 'TypeScript', 'Docker'],
      complexity: 'advanced',
      why_this_project:
        'Directly closes your infrastructure ownership gap and provides a concrete system design story for Senior interviews.',
      deliverables: [
        'Working notification service handling 1k+ events/min',
        'Terraform IaC scripts for full AWS deployment',
        'Architecture diagram with trade-off documentation (ADR)',
        'Load test results showing throughput and latency',
      ],
      hiring_signals: [
        'Infrastructure-as-code ownership',
        'Distributed systems reasoning',
        'Architecture documentation',
      ],
      estimated_timeline: '3–4 weeks',
    },
    {
      project_title: 'GraphQL Developer API',
      description:
        'Build a GraphQL API layer over an existing REST service or database. Include auth, rate limiting, and schema documentation.',
      skills: ['GraphQL', 'Apollo Server', 'TypeScript', 'Node.js', 'PostgreSQL'],
      complexity: 'intermediate',
      why_this_project:
        'GraphQL appears in 68% of Senior front-end JDs. This closes that keyword gap while demonstrating API design thinking.',
      deliverables: [
        'Schema-first GraphQL API with typed resolvers',
        'Auth middleware with JWT validation',
        'Rate limiting implementation',
        'Postman/GraphQL Playground examples',
      ],
      hiring_signals: ['GraphQL proficiency', 'API design decisions', 'Security awareness'],
      estimated_timeline: '2–3 weeks',
    },
    {
      project_title: 'Internal Dev Dashboard',
      description:
        'Build a React/TypeScript dashboard that aggregates deployment status, error rates, and team metrics from mock APIs.',
      skills: ['React', 'TypeScript', 'Recharts', 'Tailwind CSS', 'React Query', 'Vite'],
      complexity: 'foundational',
      why_this_project:
        'Demonstrates full-stack ownership with a relatable product context. Easy to present in an interview as a "product" rather than a "toy".',
      deliverables: [
        'Live deployed dashboard (Vercel or Netlify)',
        'Mobile-responsive design',
        'README with feature explanation and architecture notes',
        'One non-trivial data visualisation',
      ],
      hiring_signals: [
        'Production deployment',
        'Frontend architecture',
        'Data visualisation',
      ],
      estimated_timeline: '1–2 weeks',
    },
  ],
  recommended_start_project: 'Real-time Notification Service',
  sequence_plan: [
    {
      order: 1,
      project_title: 'Internal Dev Dashboard',
      reason:
        'Start here to get something deployed and linkable quickly. Builds momentum and gives you a talking point for every interview.',
    },
    {
      order: 2,
      project_title: 'GraphQL Developer API',
      reason: 'Closes the most common ATS keyword gap next, with manageable complexity.',
    },
    {
      order: 3,
      project_title: 'Real-time Notification Service',
      reason:
        'Build this last when you have Terraform and AWS exposure from the previous projects. This is your flagship interview story.',
    },
  ],
  presentation_tips: [
    'Write a README for every project that explains the "why" before the "what". Interviewers read these.',
    'Record a 2-minute Loom walkthrough of your most complex project. Attach the link in your resume.',
    'Frame each project around the problem it solves, not the tech stack it uses.',
    'Add a "trade-offs and future improvements" section to every README to show architectural thinking.',
  ],
  top_actions: [
    {
      title: 'Deploy the dashboard this week',
      action:
        'Start with the Internal Dev Dashboard — it can be on Vercel in a day and immediately links to from your resume.',
      priority: 'high',
    },
    {
      title: 'Set a Terraform study date',
      action:
        'Book 3 hours this weekend to start the Terraform Associate study path. You need this for the Notification Service.',
      priority: 'high',
    },
    {
      title: 'Write architecture notes for your strongest existing project',
      action:
        'Before building new things, document one existing project properly. An ADR + README upgrade takes 2 hours and immediately improves your portfolio.',
      priority: 'medium',
    },
  ],
}

export const coverLetterMockPayload = {
  summary: {
    headline: 'Targeted cover letter draft ready for review.',
    verdict: 'Application-ready draft',
    confidence_note:
      'This is an advisory draft. Review the evidence claims before sending — you know your experience better than the model does.',
  },
  generated_at: new Date().toISOString(),
  tone_used: 'Professional · Direct · Confident',
  opening: {
    text: "Dear Hiring Team,\n\nI'm applying for the Senior Full-Stack Engineer role at Stripe. With five years of experience building production React and Node.js applications — including a payments dashboard serving 200k monthly active users — I'm drawn to Stripe's engineering culture and the complexity of the infrastructure challenge you're solving.",
    why_this_paragraph:
      'Opens with a direct connection between the most relevant experience and the role context. Avoids generic openers.',
    requirements_used: ['React/TypeScript experience', 'Payments domain knowledge'],
    evidence_used: ['payments dashboard', '200k MAU', '5 years experience'],
  },
  body_points: [
    {
      text: "At Acme Corp, I led the frontend architecture of a SaaS platform rebuilt from a monolith to a modular React component system. This reduced our onboarding time for new engineers by 35% and cut our average pull request review cycle from 4 days to under 24 hours. I worked closely with design and product to align technical decisions with roadmap constraints — a pattern I'd expect to continue in a cross-functional team at Stripe.",
      why_this_paragraph:
        'Connects technical ownership to business impact and cross-team collaboration, addressing two priority requirements.',
      requirements_used: ['Technical leadership', 'Cross-functional collaboration'],
      evidence_used: ['monolith migration', '35% onboarding improvement', '24-hour PR cycle'],
    },
    {
      text: 'On the infrastructure side, I own our CI/CD pipeline on GitHub Actions and have worked with AWS S3, EC2, and CloudFront for asset delivery and compute. I reduced our CI build time by 40% through caching and parallelisation. I\'m actively building Terraform skills for infrastructure-as-code — I\'d expect to close this gap quickly in an environment with strong platform engineering support.',
      why_this_paragraph:
        'Addresses the cloud infrastructure requirement honestly — acknowledging the gap (Terraform) while showing the growth trajectory.',
      requirements_used: ['Cloud infrastructure (AWS)', 'CI/CD pipeline ownership'],
      evidence_used: ['GitHub Actions ownership', 'AWS EC2/S3/CloudFront', '40% CI improvement'],
    },
  ],
  closing: {
    text: "I'm excited about the challenge of building at Stripe's scale and the depth of engineering investment the role requires. I'd welcome the opportunity to discuss how my experience translates.\n\nBest regards,\nAdrian Nowak",
    why_this_paragraph:
      'Short, confident close that re-states interest without overselling. Avoids filler phrases.',
    requirements_used: [],
    evidence_used: [],
  },
  full_text:
    "Dear Hiring Team,\n\nI'm applying for the Senior Full-Stack Engineer role at Stripe. With five years of experience building production React and Node.js applications — including a payments dashboard serving 200k monthly active users — I'm drawn to Stripe's engineering culture and the complexity of the infrastructure challenge you're solving.\n\nAt Acme Corp, I led the frontend architecture of a SaaS platform rebuilt from a monolith to a modular React component system. This reduced our onboarding time for new engineers by 35% and cut our average pull request review cycle from 4 days to under 24 hours. I worked closely with design and product to align technical decisions with roadmap constraints — a pattern I'd expect to continue in a cross-functional team at Stripe.\n\nOn the infrastructure side, I own our CI/CD pipeline on GitHub Actions and have worked with AWS S3, EC2, and CloudFront for asset delivery and compute. I reduced our CI build time by 40% through caching and parallelisation. I'm actively building Terraform skills for infrastructure-as-code — I'd expect to close this gap quickly in an environment with strong platform engineering support.\n\nI'm excited about the challenge of building at Stripe's scale and the depth of engineering investment the role requires. I'd welcome the opportunity to discuss how my experience translates.\n\nBest regards,\nAdrian Nowak",
  customization_notes: [
    {
      category: 'evidence',
      note: 'Payments dashboard experience directly mirrors Stripe\'s domain — led the opening paragraph.',
      requirements_used: ['Domain relevance'],
      source: 'resume',
    },
    {
      category: 'gap',
      note: 'Terraform gap acknowledged proactively to avoid appearing evasive in the screen.',
      requirements_used: ['Infrastructure as code'],
      source: 'job-match',
    },
    {
      category: 'tone',
      note: 'Kept to 3 paragraphs + close. Stripe engineering culture prefers directness over volume.',
      requirements_used: [],
      source: 'job-description',
    },
  ],
  top_actions: [
    {
      title: 'Verify the payments dashboard claim',
      action:
        'Confirm the 200k MAU figure is accurate before submitting. If approximate, add "approximately" or adjust to the correct order of magnitude.',
      priority: 'high',
    },
    {
      title: 'Personalise the Stripe reference',
      action:
        'Replace "infrastructure challenge you\'re solving" with a specific Stripe product or engineering post you can reference. Signals genuine interest.',
      priority: 'medium',
    },
    {
      title: 'Trim if over one page',
      action:
        'If the formatted letter exceeds one page, cut the second body paragraph to a single sentence. Brevity signals respect for the reader\'s time.',
      priority: 'low',
    },
  ],
}

export const careerMockPayload = {
  summary: {
    headline: 'Clear path to senior IC with a two-stage skill build.',
    verdict: 'High confidence',
    confidence_note:
      'Career path advice is directional and advisory. Actual progression depends on company structure, market conditions, and individual performance.',
  },
  recommended_direction: {
    role_title: 'Senior Full-Stack Engineer → Staff / Tech Lead',
    fit_score: 84,
    transition_timeline: '12–18 months to Senior, 24–36 months to Staff/Lead',
    why_now:
      'Strong delivery track record and growing scope are already Staff-adjacent. The missing ingredient is documented system-design ownership and cross-team influence.',
    confidence: 'high',
  },
  paths: [
    {
      role_title: 'Engineering Manager',
      fit_score: 62,
      transition_timeline: '24–36 months',
      rationale:
        'Possible but requires building people-management proof. Worth exploring only if you find mentorship more energising than architecture.',
      strengths_to_leverage: ['Cross-functional experience', 'Project leadership'],
      gaps_to_close: ['Direct report management', 'Performance review experience', 'Hiring process'],
      risk_level: 'medium',
    },
    {
      role_title: 'Product Engineer / Founding Engineer',
      fit_score: 76,
      transition_timeline: '6–12 months',
      rationale:
        'Strong fit for startup environments. Trade structured growth for speed and equity. High upside, higher variance.',
      strengths_to_leverage: ['Full-stack breadth', 'Agile delivery', 'Startup-adjacent work pace'],
      gaps_to_close: ['Business metrics literacy', 'Prioritisation under constraint', 'Founder communication'],
      risk_level: 'medium',
    },
  ],
  current_skills: [
    'React', 'TypeScript', 'Node.js', 'REST APIs', 'AWS (S3/EC2)',
    'PostgreSQL', 'Docker', 'CI/CD (GitHub Actions)', 'Agile',
  ],
  target_skills: [
    'System design', 'Kubernetes', 'GraphQL', 'Tech mentorship',
    'Architecture documentation', 'Cross-team influence', 'Terraform',
  ],
  skill_gaps: [
    {
      skill: 'System design & architecture',
      urgency: 'high',
      why_it_matters:
        'Senior and Staff roles require leading technical design discussions. Without this proof, you will be seen as a solid implementer rather than an architect.',
      how_to_build:
        'Lead one architectural decision in your current role. Document it as an ADR (Architecture Decision Record).',
    },
    {
      skill: 'Infrastructure as code (Terraform)',
      urgency: 'high',
      why_it_matters:
        'Most Staff+ roles at well-run companies require owning your own infra rather than relying on a platform team.',
      how_to_build:
        'Complete the HashiCorp Terraform Associate certification (2–4 weeks).',
    },
    {
      skill: 'Technical mentorship',
      urgency: 'medium',
      why_it_matters:
        'Levelling up to Senior requires demonstrable evidence of raising others. This is the most frequently under-evidenced skill on mid-level resumes.',
      how_to_build:
        'Mentor a junior developer formally. Ask your manager to note it in your performance review.',
    },
    {
      skill: 'GraphQL',
      urgency: 'medium',
      why_it_matters:
        'GraphQL appears in 68% of senior front-end JDs. Not knowing it is a recurring ATS gap.',
      how_to_build:
        'Build one internal tool or side project using Apollo Client + a GraphQL API.',
    },
    {
      skill: 'Kubernetes',
      urgency: 'low',
      why_it_matters: 'Increasingly expected for Staff+ at larger companies.',
      how_to_build:
        'Complete the CKAD (Certified Kubernetes Application Developer) in 6–8 weeks.',
    },
  ],
  next_steps: [
    { timeframe: 'This week', action: 'Document your last architectural decision as an ADR. Use it as interview evidence.' },
    { timeframe: 'Month 1', action: 'Start the Terraform Associate study path. Set a 30-day exam date.' },
    { timeframe: 'Month 2', action: 'Propose mentoring a junior developer to your manager. Frame it as your promotion evidence.' },
    { timeframe: 'Month 3', action: 'Ship a side project with GraphQL and add it to your resume.' },
  ],
  top_actions: [
    {
      title: 'Lead and document one architectural decision',
      action:
        'Create an ADR for an upcoming technical decision in your team. This is the single most transferable proof artifact for a Senior role.',
      priority: 'high',
    },
    {
      title: 'Earn the Terraform Associate cert',
      action:
        'Two to four weeks of study closes the infrastructure ownership gap that blocks most mid-level engineers from Staff-level roles.',
      priority: 'high',
    },
    {
      title: 'Set up formal mentorship with a junior developer',
      action:
        'Agree a scope with your manager so it can be noted in your next review as evidence of Senior-level scope.',
      priority: 'medium',
    },
  ],
}
