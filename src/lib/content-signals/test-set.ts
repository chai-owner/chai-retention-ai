// CONSTRUCTED TEST EXAMPLES — NOT REAL CUSTOMER LANGUAGE.
//
// Every message below was written by hand for the Phase 0 validation of
// content-based risk-signal extraction. None of it came from a real account,
// a real customer, or any connected support inbox. Any accuracy figure
// produced against this file must be reported as "validated against
// constructed test examples", never as "validated" on its own.
//
// Difficulty is deliberately mixed: "obvious" states the signal plainly,
// "subtle" only implies it, matching the detection-difficulty concern raised
// for the circumstantial signals.

export type SignalType =
  | "competitor_mentioned"
  | "cancellation_intent"
  | "champion_departure"
  | "company_distress";

export const SIGNAL_TYPES: SignalType[] = [
  "competitor_mentioned",
  "cancellation_intent",
  "champion_departure",
  "company_distress",
];

export interface TestExample {
  id: string;
  /** Ground truth: the signals genuinely present. Empty array = clean. */
  labels: SignalType[];
  difficulty: "obvious" | "subtle";
  text: string;
}

export const CONSTRUCTED_TEST_SET: TestExample[] = [
  // ---------------------------------------------------------------- competitor
  {
    id: "comp-01",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: We're doing a side-by-side with Gainsight this quarter and honestly their reporting looks stronger. Can you tell me what you have that they don't?",
  },
  {
    id: "comp-02",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: Our board asked us to evaluate ChurnZero before we renew. Can someone send over a feature comparison?",
  },
  {
    id: "comp-03",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: A rep from Totango reached out and their pricing is about 30% under what we pay you. Is there room to move on ours?",
  },
  {
    id: "comp-04",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: We've started a trial of Vitally in parallel. Just being upfront — we want to see which one the team actually uses.",
  },
  {
    id: "comp-05",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: Planhat does the health scoring natively without us exporting anything. Why is that still a manual step here?",
  },
  {
    id: "comp-06",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: Our sister company uses something else for this and their weekly report lands in Slack automatically. Is that on your roadmap at all?",
  },
  {
    id: "comp-07",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: I sat through a demo last week of a tool that does this plus the QBR deck generation. Made me wonder if we're using the right thing.",
  },
  {
    id: "comp-08",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: New VP came in from a company that ran a different platform and he keeps asking why our setup looks the way it does.",
  },
  {
    id: "comp-09",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: Someone in procurement has been collecting quotes in this category. Nothing to worry about yet, but they asked me for our current contract terms.",
  },
  {
    id: "comp-10",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: We're moving our support stack to Intercom. Does that break anything on your side?\nAgent: No, we support Intercom.\nCustomer: Good. We also looked at whether Intercom's own reporting could replace what we use you for.",
  },
  {
    id: "comp-11",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: At the conference last month a few peers said they'd consolidated onto one vendor for this and saved a fair bit. Our CFO heard the same pitch.",
  },
  {
    id: "comp-12",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: Straight question — what happens to our data if we migrate to another provider? Asking because we're scoping that out.",
  },
  {
    id: "comp-13",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: My counterpart at our parent org swears by whatever they're running. I've asked for a walkthrough so I can compare notes.",
  },
  {
    id: "comp-14",
    labels: ["competitor_mentioned"],
    difficulty: "obvious",
    text: "Customer: HubSpot's new customer-health beta covers a chunk of this and it's included in our existing seat cost. Hard to justify two tools.",
  },
  {
    id: "comp-15",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: We're running an internal bake-off in November across a few options in this space. I'd like you on the shortlist, so anything you can send that makes the case would help.",
  },
  {
    id: "comp-16",
    labels: ["competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: Honestly the only reason we haven't switched is the migration effort.",
  },

  // ------------------------------------------------------------- cancellation
  {
    id: "canc-01",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: Please cancel our subscription at the end of the current term. Who do I send written notice to?",
  },
  {
    id: "canc-02",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: We've decided not to renew in March. I'd like to get the offboarding steps in writing.",
  },
  {
    id: "canc-03",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: What's the notice period on our contract? We may need to exercise it.",
  },
  {
    id: "canc-04",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: Can you confirm we can export everything before the account closes? We're winding this down.",
  },
  {
    id: "canc-05",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: This is the third outage this month. I've lost the argument internally for keeping this — we're cancelling.",
  },
  {
    id: "canc-06",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: Can you take us down to the minimum number of seats at renewal? Realistically only one person still logs in.",
  },
  {
    id: "canc-07",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: Could you switch us to monthly instead of annual at renewal? We don't want to commit twelve months ahead right now.",
  },
  {
    id: "canc-08",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: No need to schedule the onboarding session for the new team — I'm not sure we'll still be on the platform by then.",
  },
  {
    id: "canc-09",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: Please don't auto-renew us. I'd like it to come to me as a decision first.",
  },
  {
    id: "canc-10",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: Is there a way to get a full export of historical data in bulk? I want everything we've accumulated in our own warehouse.\nAgent: Sure — may I ask what's driving it?\nCustomer: Just want to be sure we're not dependent on any one system.",
  },
  {
    id: "canc-11",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: We've signed with someone else. Let's talk about ending our agreement cleanly.",
  },
  {
    id: "canc-12",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: The renewal quote came through. I'm going to park it — we're reviewing whether we need this at all next year.",
  },
  {
    id: "canc-13",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: Terminating effective immediately. Please confirm the final invoice and stop billing the card on file.",
  },
  {
    id: "canc-14",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: We're pausing all non-essential tools while we reassess. I'll let you know where this one lands.",
  },
  {
    id: "canc-15",
    labels: ["cancellation_intent"],
    difficulty: "subtle",
    text: "Customer: Don't spend time building that integration for us. I can't promise we'll be around to use it.",
  },
  {
    id: "canc-16",
    labels: ["cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: I need the cancellation clause explained. If we leave before the term ends, what do we still owe?",
  },

  // ---------------------------------------------------------- champion depart
  {
    id: "champ-01",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Just so you know, Priya has left the company. I'm picking up her accounts for now — please move the admin seat to me.",
  },
  {
    id: "champ-02",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Friday is my last day. I've copied Tom, who'll take over this relationship.",
  },
  {
    id: "champ-03",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Our Head of CS resigned last week and nobody has been named to replace her yet. Can you hold off on the quarterly review?",
  },
  {
    id: "champ-04",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Please remove daniel@ from the account — he's moved on — and add me as the billing contact.",
  },
  {
    id: "champ-05",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: Hi, I'm new here and inherited this account. I genuinely don't know what it's used for or who set it up. Can you start from the beginning?",
  },
  {
    id: "champ-06",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Agent: Following up on the thread with Marcus.\nCustomer: Marcus isn't with us anymore. Send anything to this address going forward.",
  },
  {
    id: "champ-07",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: The person who owned this has moved to a different team internally and isn't involved any longer. I'm covering it on top of my own role.",
  },
  {
    id: "champ-08",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: Your emails are bouncing because that mailbox was closed. Use mine.",
  },
  {
    id: "champ-09",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: We've had three people rotate through this account in six months. I'm the current one. Please don't make me the fourth handover.",
  },
  {
    id: "champ-10",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: Whoever originally signed us up is long gone, so I can't tell you what was agreed. Do you have the original contract?",
  },
  {
    id: "champ-11",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Sarah's role was made redundant. She was our main user here. I'll need training from scratch.",
  },
  {
    id: "champ-12",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: There's nobody owning this internally at the moment. It's sitting with me by default until they hire.",
  },
  {
    id: "champ-13",
    labels: ["champion_departure"],
    difficulty: "obvious",
    text: "Customer: Our CTO, who sponsored the original purchase, left in August. The new one is reviewing all the tooling he brought in.",
  },
  {
    id: "champ-14",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: Can you deactivate the two logins that haven't been used since June? Those people aren't here.",
  },
  {
    id: "champ-15",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: Apologies for the slow reply — this inbox is being monitored by the team rather than one person now, since Ed moved on.",
  },
  {
    id: "champ-16",
    labels: ["champion_departure"],
    difficulty: "subtle",
    text: "Customer: I've taken over from my predecessor and I'm auditing what we pay for. What exactly does this do for us?",
  },

  // ------------------------------------------------------------- company distress
  {
    id: "dist-01",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: We announced layoffs this morning — about 20% of the company. I'll need to cut our seat count accordingly.",
  },
  {
    id: "dist-02",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: There's a hiring freeze in place and every renewal now needs CFO sign-off. That includes this one.",
  },
  {
    id: "dist-03",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: Budgets were cut across the board for next year. Software spend has to come down 30%.",
  },
  {
    id: "dist-04",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: We're restructuring and my department is being merged into another. Everything is on hold until that settles.",
  },
  {
    id: "dist-05",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: Can we push the invoice to next quarter? Cash is tight at the moment and I'd rather not raise it now.",
  },
  {
    id: "dist-06",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: Any spend over £500 now goes to an approvals committee that meets monthly. It didn't used to.",
  },
  {
    id: "dist-07",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: We've closed the Manchester office and consolidated everyone into one location. Fewer people overall.",
  },
  {
    id: "dist-08",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: The team is half the size it was when we onboarded, so a lot of these workflows don't apply anymore.",
  },
  {
    id: "dist-09",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: We're in the middle of an acquisition and all vendor contracts are frozen pending review by the acquiring company.",
  },
  {
    id: "dist-10",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: Our biggest client didn't renew with us, so we're being careful with everything this year.",
  },
  {
    id: "dist-11",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: Redundancy consultations started last week. I may not be the right contact in a month.",
  },
  {
    id: "dist-12",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: We didn't close the funding round we were expecting, so we're running leaner than planned into next year.",
  },
  {
    id: "dist-13",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: Procurement has been told to renegotiate every contract that comes up. Nothing personal — it's coming from the top.",
  },
  {
    id: "dist-14",
    labels: ["company_distress"],
    difficulty: "obvious",
    text: "Customer: Finance has put a freeze on all new and renewing software spend until the end of the fiscal year.",
  },
  {
    id: "dist-15",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: We've paused the expansion project this was bought for. It's on ice indefinitely.",
  },
  {
    id: "dist-16",
    labels: ["company_distress"],
    difficulty: "subtle",
    text: "Customer: Payment will be late again this month, sorry. Our own receivables have slipped badly.",
  },

  // -------------------------------------------------------------------- mixed
  {
    id: "mix-01",
    labels: ["company_distress", "cancellation_intent"],
    difficulty: "obvious",
    text: "Customer: After the layoffs we're cutting tooling. I'm afraid we won't be renewing — can you send the offboarding process?",
  },
  {
    id: "mix-02",
    labels: ["champion_departure", "competitor_mentioned"],
    difficulty: "subtle",
    text: "Customer: I've taken this over from Jen, who's left. For context, at my last company we used a different platform for this, so I may compare a few things.",
  },

  // -------------------------------------------------------------------- clean
  {
    id: "clean-01",
    labels: [],
    difficulty: "obvious",
    text: "Customer: The CSV export is putting dates in US format. Can it be changed to DD/MM/YYYY?",
  },
  {
    id: "clean-02",
    labels: [],
    difficulty: "obvious",
    text: "Customer: I can't log in after the password reset — the link says expired even though I clicked it straight away.",
  },
  {
    id: "clean-03",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Is there a way to schedule the weekly report to send on Mondays instead of Fridays?",
  },
  {
    id: "clean-04",
    labels: [],
    difficulty: "obvious",
    text: "Customer: We were charged twice this month. Can you check the billing history?",
  },
  {
    id: "clean-05",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Can you add three more users to our account? Names and emails below.",
  },
  {
    id: "clean-06",
    labels: [],
    difficulty: "obvious",
    text: "Customer: The dashboard chart isn't loading in Safari. Works fine in Chrome.",
  },
  {
    id: "clean-07",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Do you have an API endpoint for pulling health scores? We want them in our own BI tool.",
  },
  {
    id: "clean-08",
    labels: [],
    difficulty: "subtle",
    text: "Customer: Our finance team needs the invoice reissued with our new registered address on it. We moved offices last month.",
  },
  {
    id: "clean-09",
    labels: [],
    difficulty: "subtle",
    text: "Customer: We're growing the team next quarter — what does it cost to add ten more seats?",
  },
  {
    id: "clean-10",
    labels: [],
    difficulty: "subtle",
    text: "Customer: A colleague mentioned there's a Slack integration. Where do I find it?",
  },
  {
    id: "clean-11",
    labels: [],
    difficulty: "subtle",
    text: "Customer: Someone new is joining my team on Monday — can you send over the getting-started material so I can pass it on?",
  },
  {
    id: "clean-12",
    labels: [],
    difficulty: "subtle",
    text: "Customer: Just checking the renewal date so I can put it in my calendar. Nothing urgent.",
  },
  {
    id: "clean-13",
    labels: [],
    difficulty: "subtle",
    text: "Customer: We compared this month's numbers against last month's and the totals don't tie up. Can you explain how the figure is calculated?",
  },
  {
    id: "clean-14",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Timezone on the timestamps looks wrong — everything shows two hours behind for us.",
  },
  {
    id: "clean-15",
    labels: [],
    difficulty: "obvious",
    text: "Customer: How do I change the email address notifications go to?",
  },
  {
    id: "clean-16",
    labels: [],
    difficulty: "subtle",
    text: "Customer: We had a bit of a rough week with an incident on our side, so apologies for the silence. Back to normal now — can we reschedule the call?",
  },
  {
    id: "clean-17",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Thanks, that fixed it. Appreciate the quick turnaround.",
  },
  {
    id: "clean-18",
    labels: [],
    difficulty: "subtle",
    text: "Customer: One of our customers is asking whether their data is stored in the EU. What do I tell them?",
  },
  {
    id: "clean-19",
    labels: [],
    difficulty: "subtle",
    text: "Customer: Our security team wants your SOC 2 report before the annual review. Who do I ask?",
  },
  {
    id: "clean-20",
    labels: [],
    difficulty: "obvious",
    text: "Customer: The mobile layout cuts off the right-hand column on my phone.",
  },
  {
    id: "clean-21",
    labels: [],
    difficulty: "subtle",
    text: "Customer: We're replacing our old spreadsheet process with this properly next month. Any tips for getting the team to actually use it?",
  },
  {
    id: "clean-22",
    labels: [],
    difficulty: "subtle",
    text: "Customer: I'm out for two weeks — please copy my colleague on anything urgent while I'm away.",
  },
  {
    id: "clean-23",
    labels: [],
    difficulty: "obvious",
    text: "Customer: Can you explain the difference between the two risk levels in the report? My team keeps asking.",
  },
  {
    id: "clean-24",
    labels: [],
    difficulty: "subtle",
    text: "Customer: The upload failed with an error about a missing column. I've attached the file — can you see what's wrong with it?",
  },
  {
    id: "clean-25",
    labels: [],
    difficulty: "subtle",
    text: "Customer: We need a purchase order number on future invoices. Our finance process changed this year.",
  },
  {
    id: "clean-26",
    labels: [],
    difficulty: "subtle",
    text: "Customer: Is there a limit to how many customers we can load? We've got about 40,000 and growing.",
  },
];
