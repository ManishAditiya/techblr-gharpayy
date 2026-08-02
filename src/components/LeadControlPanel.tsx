import { useEffect, useMemo, useState } from "react";
import { useApp, getProperty, getTcm } from "@/lib/store";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar, IntentChip, StageBadge } from "./atoms";
import { HandoffThread } from "./HandoffThread";
import { SequenceChip } from "./SequenceChip";
import { SupplyMatchPanel } from "./leads/SupplyMatchPanel";
import { PostVisitGate } from "./crm10x/PostVisitGate";
import { CommitmentBanner } from "./crm10x/CommitmentBanner";
import { ObjectionTag } from "./crm10x/ObjectionLogger";
import { LeadDossierPanel } from "./crm10x/LeadDossierPanel";
import { PTQScorecard } from "./crm10x/PTQScorecard";
import { QuotationBuilder } from "./crm10x/QuotationBuilder";
import { CheckInPanel } from "./checkins/CheckInPanel";

import { SmartDossier } from "./crm10x/SmartDossier";
import { LeadPropertyDossier } from "./impact/LeadPropertyDossier";
import { CommandActions, useImpactStateForLead } from "./impact/ImpactQueue";
import { LeadJourneyStepper, type JourneyTab } from "./crm10x/LeadJourneyStepper";
import { useLeadFocus } from "@/lib/crm10x/lead-focus";
import { useDossierReadiness } from "@/lib/crm10x/dossier-readiness";
import { pressureColor } from "@/lib/crm10x/impact-scoring";
import {
  Phone, MessageSquare, Calendar as CalendarIcon, Tag, ClipboardCheck,
  AlertTriangle, CheckCircle2, X, Activity as ActivityIcon, MapPin,
  Wallet, Send, Zap, IndianRupee, BellRing, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { LeadStage, FollowUpPriority, SequenceKind } from "@/lib/types";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { sendTourMessage as sendOwnerTourMessage } from "@/owner/messaging";
import { useSettings } from "@/myt/lib/settings-context";
import FEATURE_FLAGS from "@/lib/featureFlags";

const TAG_OPTIONS = ["price-issue", "location-mismatch", "parents-involved", "urgent", "budget-low"];
const OBJECTIONS = ["Budget", "Location", "Amenities", "Timing", "Parents", "Comparing options", "Other"];
const TEMPLATES = [
  { id: "tour-confirm", label: "Tour confirmation", body: "Hi! Confirming your tour today. Looking forward to meeting you." },
  { id: "post-tour", label: "Post-tour check-in", body: "Hi! How did you find the property? Happy to answer any questions." },
  { id: "scarcity", label: "Scarcity", body: "Just a heads-up — only a couple of beds left at this price." },
];

export function LeadControlPanel() {
  const {
    selectedLeadId, selectedLeadTab, selectLead, leads, properties, tours, activities, tcms,
    setLeadStage, setLeadIntent, setLeadFollowUp, addLeadTag, removeLeadTag,
    scheduleTour, cancelTour, rescheduleTour, completeTour, setDecision, updatePostTour,
    addNote, logCall, sendMessage, autoAssignLead, startSequence, closeDeal,
    markHandoffsRead,
  } = useApp();
  const { settings } = useSettings();

  const lead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);

  // Mark handoffs read when this lead opens
  useEffect(() => {
    if (selectedLeadId) markHandoffsRead(selectedLeadId);
  }, [selectedLeadId, markHandoffsRead]);

  const leadTours = useMemo(
    () => (lead ? tours.filter((t) => t.leadId === lead.id).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)) : []),
    [tours, lead],
  );
  const leadActivities = useMemo(
    () => (lead ? activities.filter((a) => a.leadId === lead.id).slice(0, 30) : []),
    [activities, lead],
  );

  // Tour scheduling form state
  const [propertyId, setPropertyId] = useState("");
  const [tcmId, setTcmId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [tab, setTab] = useState("control");
  const [, mounted] = useMountedNow();

  // Note state
  const [note, setNote] = useState("");
  const [customMsg, setCustomMsg] = useState("");

  const pendingPostTour = leadTours.find(
    (t) => t.status === "completed" && !t.postTour.filledAt,
  );
  const upcomingTour = leadTours.find((t) => t.status === "scheduled");

  // Shared "what is this lead currently focused on?" — feeds prefills across
  // every form in the drawer so filling one (quote / tour / booking / check-in)
  // automatically seeds the others.
  const focus = useLeadFocus(lead);
  const dossier = useDossierReadiness(lead);

  // Seed form state ONCE per lead.id change — not on every lead-store mutation,
  // otherwise typing into the tour/follow-up form wipes mid-entry.
  useEffect(() => {
    if (!lead) return;
    setPropertyId(focus.propertyId ?? upcomingTour?.propertyId ?? "");
    setTcmId(focus.tcmId || upcomingTour?.tcmId || lead.assignedTcmId || "");
    setScheduledAt(
      upcomingTour
        ? toLocal(upcomingTour.scheduledAt)
        : focus.scheduledAt
          ? toLocal(focus.scheduledAt)
          : "",
    );
    setTab(selectedLeadTab ?? (pendingPostTour ? "post" : upcomingTour ? "tour" : settings.matching.drawerDefaultTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, selectedLeadTab]);

  if (!lead) return null;

  const tcm = getTcm(lead.assignedTcmId);

  const handleSchedule = () => {
    if (!propertyId || !tcmId || !scheduledAt) {
      toast.error("Property, TCM and time are required");
      return;
    }
    if (!dossier.ready) {
      toast.warning(`Dossier ${dossier.filledCount}/${dossier.totalCount} — scheduling anyway`, {
        description: `Still missing: ${dossier.missing.join(", ")}`,
      });
    }
    scheduleTour({ leadId: lead.id, propertyId, tcmId, scheduledAt: new Date(scheduledAt).toISOString() });
    setPropertyId(""); setTcmId(""); setScheduledAt("");
    toast.success("Tour scheduled");
  };

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(o) => !o && selectLead(null)}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] p-0 flex flex-col">
        {/* Header block */}
        <SheetHeader className="px-5 py-4 border-b border-border space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-lg leading-tight">{lead.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {lead.phone} · via {lead.source}
              </SheetDescription>
            </div>
            <button
              onClick={() => selectLead(null)}
              className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StageBadge stage={lead.stage} />
            <IntentChip intent={lead.intent} />
            <ConfidenceBar value={lead.confidence} />
            <ObjectionTag leadId={lead.id} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <Meta icon={CalendarIcon} label="Move-in" value={format(new Date(lead.moveInDate), "MMM d")} />
            <Meta icon={Wallet} label="Budget" value={`₹${(lead.budget / 1000).toFixed(0)}k`} />
            <Meta icon={MapPin} label="Area" value={lead.preferredArea} />
          </div>
          <div className="text-[11px] text-muted-foreground">Assigned · {tcm?.name ?? "—"} ({tcm?.zone ?? "—"})</div>
        </SheetHeader>

        {/* Guided journey stepper — Dossier → Tour → Post → Quote · Book → Check-in */}
        <LeadJourneyStepper
          lead={lead}
          currentTab={tab}
          onJump={(t: JourneyTab) => setTab(t)}
        />

        {/* CRM 10x — commitment banner + 48h post-visit gate */}
        <CommitmentBanner lead={lead} />
        <PostVisitGate lead={lead} />

        {/* Stale alert */}
        {pendingPostTour && (
          <div className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-destructive">Post-tour update missing</div>
              <div className="text-muted-foreground">
                Tour completed {mounted ? formatDistanceToNow(new Date(pendingPostTour.scheduledAt), { addSuffix: true }) : "recently"}.
                TCM must fill the form below.
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Tabs value={tab} onValueChange={setTab} className="px-5 py-4">
            {/* Primary actions live inside each tab (CommandActions in Impact,
                deep dialogs in Tour / Quote / Check-in). The sticky shortcut
                bar was removed because every button it carried was a thinner
                duplicate of the in-depth dialog rendered below. */}
            {/* Journey steps (Dossier · Tour · Post · Quote · Check-in) are
                driven by the stepper above; this row exposes the secondary
                surfaces only. One primary action per state, fewer clicks. */}
            <TabsList className="grid h-auto w-full grid-cols-5 gap-1">
              <TabsTrigger value="impact" className="text-xs">Impact</TabsTrigger>
              <TabsTrigger value="best-fit" className="text-xs">Best Fit</TabsTrigger>
              <TabsTrigger value="control" className="text-xs">Control</TabsTrigger>
              <TabsTrigger value="handoff" className="text-xs">Handoff</TabsTrigger>
              <TabsTrigger value="log" className="text-xs">Log</TabsTrigger>
            </TabsList>

            <TabsContent value="impact" className="space-y-4 pt-4">
              <ImpactTabContent lead={lead} />
            </TabsContent>

            <TabsContent value="dossier" className="space-y-4 pt-4">
              <LeadDossierPanel lead={lead} />
            </TabsContent>

            <TabsContent value="checkin" className="space-y-4 pt-4">
              <CheckInPanel lead={lead} />
            </TabsContent>

            <TabsContent value="best-fit" className="space-y-4 pt-4">
              <Section title="Best property matches">
                <SupplyMatchPanel lead={lead} onNavigateAway={() => selectLead(null)} />
              </Section>
            </TabsContent>

            {/* CONTROL — status, intent, follow-up, action engine, notes, tags */}
            <TabsContent value="control" className="space-y-4 pt-4">
              <SequenceChip leadId={lead.id} />

              {FEATURE_FLAGS.leadRouting && (
                <Section title="Routing">
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm" className="flex-1"
                      onClick={() => {
                        const r = autoAssignLead(lead.id);
                        const tcm = tcms.find((t) => t.id === r.tcmId);
                        toast.success(`Auto-routed to ${tcm?.name ?? "TCM"}`, { description: r.reasons.join(" · ") });
                      }}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1.5" /> Auto-route to best TCM
                    </Button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Currently with <span className="text-foreground font-medium">{tcm?.name ?? "—"}</span> · {tcm?.zone ?? "—"} · {Math.round((tcm?.conversionRate ?? 0) * 100)}% conv
                  </div>
                </Section>
              )}

              <Section title="Status engine">
                <Select value={lead.stage} onValueChange={(v) => {
                  const prev = lead.stage;
                  setLeadStage(lead.id, v as LeadStage);
                  if (v === "dropped") {
                    toast("Marked dropped", {
                      description: `${lead.name} → dropped`,
                      action: {
                        label: "Undo",
                        onClick: () => { setLeadStage(lead.id, prev); toast.success("Restored"); },
                      },
                      duration: 5000,
                    });
                  }
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["new","contacted","tour-scheduled","tour-done","negotiation","booked","dropped"] as LeadStage[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace("-", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(["first-contact","post-tour","pre-decision","cold-revival"] as SequenceKind[]).map((k) => (
                    <Button
                      key={k} size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => { startSequence(lead.id, k); toast.success(`Started ${k} sequence`); }}
                    >
                      Start {k}
                    </Button>
                  ))}
                </div>
              </Section>

              <Section title="Action engine">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => { logCall(lead.id); toast.success("Call logged"); }}>
                    <Phone className="h-3.5 w-3.5 mr-1.5" /> Call
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { sendMessage(lead.id, "WhatsApp template sent"); toast.success("Message sent"); }}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Templates</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <Button
                        key={t.id} variant="secondary" size="sm" className="h-7 text-[11px]"
                        onClick={() => { sendMessage(lead.id, t.body); toast.success(`Sent: ${t.label}`); }}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customMsg} onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Custom message…" className="h-9 text-sm"
                  />
                  <Button
                    size="sm" disabled={!customMsg.trim()}
                    onClick={() => { sendMessage(lead.id, customMsg); setCustomMsg(""); toast.success("Sent"); }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Section>

              <Section title="Follow-up engine">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Next follow-up</Label>
                    <Input
                      key={lead.id}
                      type="datetime-local"
                      defaultValue={lead.nextFollowUpAt ? toLocal(lead.nextFollowUpAt) : ""}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setLeadFollowUp(lead.id, new Date(e.target.value).toISOString(), priorityFor(lead.confidence));
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Priority</Label>
                    <Select
                      value={lead.intent === "hot" ? "high" : lead.intent === "warm" ? "medium" : "low"}
                      onValueChange={(v) => setLeadIntent(lead.id, v === "high" ? "hot" : v === "medium" ? "warm" : "cold")}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Hot</SelectItem>
                        <SelectItem value="medium">Warm</SelectItem>
                        <SelectItem value="low">Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {lead.nextFollowUpAt && (
                  <div className="text-[11px] text-muted-foreground">
                    Due {mounted ? formatDistanceToNow(new Date(lead.nextFollowUpAt), { addSuffix: true }) : "soon"}
                  </div>
                )}
              </Section>

              <Section title="Notes & signals">
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {t}
                      <button onClick={() => removeLeadTag(lead.id, t)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.filter((t) => !lead.tags.includes(t)).map((t) => (
                    <button
                      key={t} onClick={() => addLeadTag(lead.id, t)}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…" rows={2} className="text-sm resize-none"
                  />
                  <Button
                    size="sm" disabled={!note.trim()}
                    onClick={() => { addNote(lead.id, note); setNote(""); toast.success("Note added"); }}
                  >
                    Add
                  </Button>
                </div>
              </Section>
            </TabsContent>

            {/* TOUR */}
            <TabsContent value="tour" className="space-y-4 pt-4">
              {upcomingTour ? (
                <Section title="Upcoming tour">
                  <UpcomingTourCard
                    tour={upcomingTour}
                    scheduledAt={scheduledAt}
                    onScheduledAtChange={setScheduledAt}
                    onReschedule={() => {
                      if (!scheduledAt) {
                        toast.error("Choose a date and time to reschedule");
                        return;
                      }
                      rescheduleTour(upcomingTour.id, new Date(scheduledAt).toISOString());
                      toast.success("Tour rescheduled");
                    }}
                    onCancel={() => {
                      const prevAt = upcomingTour.scheduledAt;
                      const tourId = upcomingTour.id;
                      cancelTour(tourId);
                      toast("Tour cancelled", {
                        description: `${lead.name} · ${format(new Date(prevAt), "MMM d, p")}`,
                        action: {
                          label: "Undo",
                          onClick: () => {
                            // restore by rescheduling — store doesn't track 'cancelled' undo cleanly
                            useApp.getState().rescheduleTour(tourId, prevAt);
                            useApp.setState((s) => ({
                              tours: s.tours.map((x) => x.id === tourId ? { ...x, status: "scheduled" } : x),
                            }));
                            toast.success("Tour restored");
                          },
                        },
                        duration: 5000,
                      });
                    }}
                     onComplete={() => {
                       completeTour(upcomingTour.id);
                       setTab("post");
                       toast.success("Tour completed — fill the post-tour form");
                     }}
                  />
                </Section>
              ) : (
                <Section title="Schedule tour">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    {!dossier.ready && (
                      <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">Dossier {dossier.filledCount}/{dossier.totalCount} — fill first</div>
                          <div className="text-warning/80">Missing: {dossier.missing.join(", ")}</div>
                        </div>
                        <button onClick={() => setTab("dossier")} className="underline font-medium shrink-0">Open Dossier</button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Property</Label>
                        <Select value={propertyId} onValueChange={setPropertyId}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick property" /></SelectTrigger>
                          <SelectContent>
                            {properties.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} · {p.area}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">TCM</Label>
                          <Select value={tcmId} onValueChange={setTcmId}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick TCM" /></SelectTrigger>
                            <SelectContent>
                              {tcms.map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-sm">{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">When</Label>
                          <Input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <Button onClick={handleSchedule} className="w-full h-9" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-1.5" />
                      {dossier.ready ? "Schedule tour" : `Schedule anyway (dossier ${dossier.filledCount}/${dossier.totalCount})`}
                    </Button>
                    <div className="text-[10px] text-muted-foreground text-center">
                      Need bulk view? Open the <button onClick={() => selectLead(null)} className="underline">Schedule console</button>.
                    </div>
                  </div>
                </Section>
              )}

              {leadTours.length > 1 && (
                <Section title="Tour history">
                  <div className="space-y-2">
                    {leadTours.slice(upcomingTour ? 1 : 0).map((t) => {
                      const prop = getProperty(t.propertyId, properties);
                      return (
                        <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{prop?.name}</span>
                            <span className="text-muted-foreground">{format(new Date(t.scheduledAt), "MMM d, p")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <Badge variant="outline" className="capitalize">{t.status}</Badge>
                            {t.decision && <Badge variant="outline" className="capitalize">{t.decision}</Badge>}
                            {t.postTour.filledAt ? (
                              <span className="text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Form complete</span>
                            ) : t.status === "completed" ? (
                              <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Form pending</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </TabsContent>

            {/* QUOTATION — inline builder */}
            <TabsContent value="quote" className="space-y-4 pt-4">
              <QuotationBuilder lead={lead} />
            </TabsContent>

            {/* POST-TOUR */}
            <TabsContent value="post" className="space-y-4 pt-4">
              {(() => {
                const target = pendingPostTour ?? leadTours.find((t) => t.status === "completed");
                if (!target) {
                  return (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      No completed tours yet. The post-tour form appears here once a tour is marked complete.
                    </div>
                  );
                }
                const prop = getProperty(target.propertyId, properties);
                const pt = target.postTour;
                return (
                  <div className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                      Tour at <span className="text-foreground font-medium">{prop?.name}</span> · {format(new Date(target.scheduledAt), "MMM d, p")}
                    </div>

                    <PTQScorecard lead={lead} tour={target} />

                    {/* Send updates / reminders — one row, always visible post-tour */}
                    {FEATURE_FLAGS.notifications && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                          disabled={!prop}
                          onClick={() => {
                            if (!prop) return;
                            sendOwnerTourMessage('post_visit_thanks', {
                              tourId: target.id, leadName: lead.name, phone: lead.phone,
                              propertyName: prop.name, area: prop.area,
                              tourDate: target.scheduledAt.slice(0, 10),
                              tourTime: target.scheduledAt.slice(11, 16),
                              tcmName: tcms.find((t) => t.id === target.tcmId)?.name,
                            });
                            toast.success('Thank-you message opened');
                          }}
                        >
                          <ExternalLink className="h-3 w-3" /> Thank-you msg
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                          onClick={() => {
                            sendMessage(lead.id, 'Quick update — any thoughts on the property?');
                            toast.success('Update sent');
                          }}
                        >
                          <Send className="h-3 w-3" /> Send update
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                          onClick={() => {
                            const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                            setLeadFollowUp(lead.id, dueAt, priorityFor(pt.confidence), 'Post-tour reminder');
                            toast.success('Reminder set for tomorrow');
                          }}
                        >
                          <BellRing className="h-3 w-3" /> Set reminder
                        </Button>
                      </div>
                    )}

                    <Section title="Outcome (mandatory · explicit)">
                      <div className="text-[11px] text-muted-foreground mb-1.5">
                        Choose carefully — the lead's stage <em>and</em> closure status update only when you click here.
                        Nothing is auto-assigned by the system.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { o: "booked", label: "Booked ✓", tone: "default" as const, decision: "booked" as const },
                          { o: "thinking", label: "Still deciding", tone: "outline" as const, decision: "thinking" as const },
                          { o: "not-interested", label: "Not interested", tone: "outline" as const, decision: "dropped" as const },
                          { o: null, label: "Awaiting outcome (no change)", tone: "ghost" as const, decision: null },
                        ] as const).map((opt) => (
                          <Button
                            key={opt.label}
                            variant={pt.outcome === opt.o ? "default" : opt.tone}
                            size="sm" className="capitalize"
                            onClick={() => {
                              if (!confirm(`Confirm outcome: ${opt.label}? This updates the lead stage.`)) return;
                              updatePostTour(target.id, { outcome: opt.o });
                              if (opt.decision) setDecision(target.id, opt.decision);
                              toast.success(`Outcome set: ${opt.label}`);
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </Section>

                    <Section title={`Deal confidence — ${pt.confidence}%`}>
                      <input
                        type="range" min={0} max={100} value={pt.confidence}
                        onChange={(e) => updatePostTour(target.id, { confidence: +e.target.value })}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </Section>

                    <Section title="Key objection">
                      <Select
                        value={pt.objection ?? ""}
                        onValueChange={(v) => updatePostTour(target.id, { objection: v })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select objection" /></SelectTrigger>
                        <SelectContent>
                          {OBJECTIONS.map((o) => <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2} placeholder="Note…" value={pt.objectionNote}
                        onChange={(e) => updatePostTour(target.id, { objectionNote: e.target.value })}
                        className="text-sm resize-none mt-2"
                      />
                    </Section>

                    <div className="grid grid-cols-2 gap-3">
                      <Section title="Expected decision">
                        <Input
                          type="date"
                          value={pt.expectedDecisionAt ? pt.expectedDecisionAt.slice(0, 10) : ""}
                          onChange={(e) => updatePostTour(target.id, { expectedDecisionAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                      <Section title="Next follow-up">
                        <Input
                          type="datetime-local"
                          value={pt.nextFollowUpAt ? toLocal(pt.nextFollowUpAt) : ""}
                          onChange={(e) => updatePostTour(target.id, { nextFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                    </div>

                    {pt.filledAt ? (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>Form complete · saved {mounted ? formatDistanceToNow(new Date(pt.filledAt), { addSuffix: true }) : "recently"}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center gap-2 text-xs">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Fill all four fields to mark this lead complete and silence the alert.</span>
                      </div>
                    )}

                    {/* Close deal — one click, blocks the bed, fires the booking */}
                    {lead.stage !== "booked" && (
                      <Button
                        size="lg" className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => {
                          closeDeal({
                            leadId: lead.id,
                            tourId: target.id,
                            propertyId: target.propertyId,
                            tcmId: target.tcmId,
                            amount: prop?.pricePerBed ?? 12000,
                          });
                          toast.success(`Deal closed · ${lead.name} → ${prop?.name}`, {
                            description: `Bed blocked, MRR +₹${((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k`,
                          });
                          setTab("checkin");
                        }}
                      >
                        <IndianRupee className="h-4 w-4 mr-1.5" /> Close deal · ₹{((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k/mo
                      </Button>
                    )}
                    {lead.stage === "booked" && (
                      <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <span className="font-semibold text-success">Booked.</span>
                        <span className="text-muted-foreground">Bed blocked, lead closed.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            {/* HANDOFF — FlowOps ↔ TCM thread for this lead */}
            <TabsContent value="handoff" className="pt-4">
              <Section title="FlowOps ↔ TCM thread">
                <HandoffThread leadId={lead.id} />
              </Section>
            </TabsContent>

            {/* ACTIVITY LOG */}
            <TabsContent value="log" className="pt-4">
              <Section title="Activity log (auto)">
                <div className="space-y-2">
                  {leadActivities.length === 0 && (
                    <div className="text-xs text-muted-foreground">No activity yet.</div>
                  )}
                  {leadActivities.map((a) => (
                    <div key={a.id} className="flex gap-2 text-xs border-l-2 border-border pl-3 py-1">
                      <ActivityIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="text-foreground">{a.text}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {format(new Date(a.ts), "MMM d, p")} · {a.actor === "system" ? "system" : tcms.find((t) => t.id === a.actor)?.name ?? a.actor}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof CalendarIcon; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className="text-xs font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function UpcomingTourCard({
  tour, scheduledAt, onScheduledAtChange, onReschedule, onCancel, onComplete,
}: {
  tour: import("@/lib/types").Tour;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  onReschedule: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { properties, tcms } = useApp();
  const prop = properties.find((p) => p.id === tour.propertyId);
  const tcm = tcms.find((t) => t.id === tour.tcmId);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-sm">{prop?.name}</div>
        <Badge className="bg-accent text-accent-foreground capitalize">{tour.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {format(new Date(tour.scheduledAt), "EEE, MMM d · p")} · {tcm?.name}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={onReschedule}>Reschedule</Button>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="flex-1" onClick={onComplete}>Mark complete</Button>
      </div>
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function priorityFor(c: number): FollowUpPriority {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}

/**
 * Impact tab — surfaces the Impact-Queue intelligence (NBA banner, SmartDossier,
 * property dossier, full CommandActions toolbelt) inside the unified Lead drawer
 * so every persona sees the same buttons (Dossier/Tour/Quote/Best Fit/Control/
 * Handoff/Log + Impact) from any entry point.
 */
function ImpactTabContent({ lead }: { lead: import("@/lib/types").Lead }) {
  const state = useImpactStateForLead(lead);
  if (!state) return null;
  const { openTour, lastQuote, column, nba, property, tcm } = state;
  return (
    <div className="space-y-4">
      <div className={`rounded-md border px-3 py-2 ${pressureColor(nba.pressure)}`}>
        <div className="text-[10px] uppercase tracking-wider opacity-70">Next best action</div>
        <div className="text-sm font-semibold">{nba.label}</div>
        <div className="text-[10px] opacity-80">{nba.reason}</div>
      </div>
      <SmartDossier lead={lead} />
      <LeadPropertyDossier lead={lead} />
      <CommandActions
        lead={lead}
        tcm={tcm}
        openTour={openTour}
        lastQuote={lastQuote}
        property={property}
        column={column}
      />
    </div>
  );
}
