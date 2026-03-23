import { useState, useMemo, useCallback, useEffect, useRef, type RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  DollarSign,
  Percent,
  Calendar,
  Shield,
  TrendingUp,
  Info,
  MapPin,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Search,
  Zap,
  Flame,
  Droplets,
  Wifi,
  Trash2,
  Loader2,
  X,
  ExternalLink,
  Pencil,
  FileText,
  Receipt,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, BarChart, Bar } from "recharts";
import {
  calculateMonthlyPayment,
  generateAmortizationSchedule,
  lookupZipCodeData,
  formatCurrency,
  type MortgageInputs,
  type MonthlyBreakdown,
  type AmortizationRow,
} from "@/lib/mortgage";
import {
  estimateUtilities,
  type UtilityInputs,
  type UtilityEstimates,
} from "@/lib/utilities";
import {
  estimateClosingCosts,
  closingCostPercentage,
  type ClosingCostInputs,
} from "@/lib/closing-costs";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ─── Shared Input Components ──────────────────

function CurrencyInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  "data-testid": testId,
}: {
  value: number;
  onChange: (val: number) => void;
  id: string;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [displayVal, setDisplayVal] = useState(formatCurrency(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplayVal(formatCurrency(value));
    }
  }, [value, focused]);

  return (
    <div className={`relative ${className || ""}`}>
      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        id={id}
        data-testid={testId}
        className="pl-9 font-mono tabular-nums"
        value={focused ? value.toString() : displayVal}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          const num = parseFloat(raw);
          if (!isNaN(num)) onChange(num);
          else if (raw === "") onChange(0);
        }}
      />
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  id,
  step = 0.125,
  "data-testid": testId,
}: {
  value: number;
  onChange: (val: number) => void;
  id: string;
  step?: number;
  "data-testid"?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        data-testid={testId}
        className="pr-8 font-mono tabular-nums"
        type="number"
        step={step}
        min={0}
        max={100}
        value={value}
        onChange={(e) => {
          const num = parseFloat(e.target.value);
          if (!isNaN(num)) onChange(num);
        }}
      />
      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// ─── Address Search Component ─────────────────

interface AddressResult {
  displayName: string;
  street: string;
  city: string;
  state: string;
  stateCode: string;
  zipCode: string;
  county: string;
  lat: number;
  lon: number;
}

function AddressSearch({
  onSelect,
  currentAddress,
}: {
  onSelect: (result: AddressResult) => void;
  currentAddress: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      // Try backend first, fall back to direct Nominatim call (for static hosting)
      let data: any;
      try {
        const res = await fetch(`${API_BASE}/api/address-search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          data = await res.json();
        } else {
          throw new Error("backend unavailable");
        }
      } catch {
        // Direct Nominatim call (works on GitHub Pages / static hosting)
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&addressdetails=1&limit=6`;
        const nomRes = await fetch(url, {
          headers: { "Accept": "application/json" },
        });
        const nomData = await nomRes.json();
        const mapped = nomData
          .filter((item: any) => {
            const type = item.type || "";
            const category = item.class || "";
            return (
              category === "place" || category === "building" || category === "highway" ||
              type === "house" || type === "residential" || type === "apartments" ||
              type === "suburb" || type === "city" || type === "town" ||
              type === "village" || type === "hamlet" || item.address?.house_number
            );
          })
          .map((item: any) => {
            const addr = item.address || {};
            return {
              displayName: item.display_name,
              street: [addr.house_number, addr.road].filter(Boolean).join(" "),
              city: addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || "",
              state: addr.state || "",
              stateCode: addr["ISO3166-2-lvl4"]?.replace("US-", "") || "",
              zipCode: addr.postcode?.split("-")[0] || "",
              county: addr.county || "",
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
            };
          })
          .filter((r: any) => r.zipCode && r.stateCode);
        data = { results: mapped };
      }
      setResults(data.results || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(value), 400);
  };

  const handleSelect = (result: AddressResult) => {
    setQuery("");
    setShowDropdown(false);
    setResults([]);
    onSelect(result);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-address-search"
          className="pl-9 pr-10"
          placeholder="Search any US address..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-popover-border rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              data-testid={`address-result-${i}`}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors border-b border-border last:border-0"
              onClick={() => handleSelect(r)}
            >
              <div className="text-sm font-medium truncate">
                {r.street || r.city}
                {r.street && r.city ? `, ${r.city}` : ""}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {r.state} {r.zipCode}{r.county ? ` · ${r.county}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
      {showDropdown && !isSearching && query.length >= 3 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-popover-border rounded-lg shadow-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a more specific address</p>
        </div>
      )}
    </div>
  );
}

// ─── Chart Components ─────────────────────────

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const TOTAL_PIE_COLORS = [
  "hsl(152, 60%, 36%)",   // mortgage green
  "hsl(215, 70%, 50%)",   // utilities blue
];

function PaymentPieChart({ breakdown }: { breakdown: MonthlyBreakdown }) {
  const data = [
    { name: "Principal & Interest", value: breakdown.principalAndInterest, color: PIE_COLORS[0] },
    { name: "Property Tax", value: breakdown.propertyTax, color: PIE_COLORS[1] },
    { name: "Home Insurance", value: breakdown.homeInsurance, color: PIE_COLORS[2] },
    ...(breakdown.pmi > 0 ? [{ name: "PMI", value: breakdown.pmi, color: PIE_COLORS[3] }] : []),
    ...(breakdown.hoa > 0 ? [{ name: "HOA", value: breakdown.hoa, color: PIE_COLORS[4] }] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={2} dataKey="value" stroke="none">
          {data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
        </Pie>
        <RechartsTooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EquityChart({ schedule }: { schedule: AmortizationRow[] }) {
  const yearlyData = useMemo(() => {
    const yearMap = new Map<number, AmortizationRow>();
    schedule.forEach((row) => yearMap.set(row.year, row));
    return Array.from(yearMap.values()).map((row) => ({
      year: row.year,
      equity: row.equity,
      balance: row.balance,
    })).sort((a, b) => a.year - b.year);
  }, [schedule]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={yearlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="year" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} width={55} />
        <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Area type="monotone" dataKey="equity" name="Home Equity" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.3} />
        <Area type="monotone" dataKey="balance" name="Balance" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.15} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InterestVsPrincipalChart({ schedule }: { schedule: AmortizationRow[] }) {
  const yearlyData = useMemo(() => {
    const yearMap = new Map<number, { principal: number; interest: number }>();
    schedule.forEach((row) => {
      const e = yearMap.get(row.year) || { principal: 0, interest: 0 };
      e.principal += row.principal;
      e.interest += row.interest;
      yearMap.set(row.year, e);
    });
    return Array.from(yearMap.entries()).map(([year, data]) => ({ year, ...data })).sort((a, b) => a.year - b.year);
  }, [schedule]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={yearlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="year" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} width={55} />
        <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar dataKey="principal" name="Principal" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
        <Bar dataKey="interest" name="Interest" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Amortization Table ───────────────────────

function AmortizationTable({ schedule }: { schedule: AmortizationRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"monthly" | "yearly">("yearly");

  const displayData = useMemo(() => {
    if (view === "yearly") {
      const yearMap = new Map<number, { year: number; totalPayment: number; totalPrincipal: number; totalInterest: number; endBalance: number }>();
      schedule.forEach((row) => {
        const e = yearMap.get(row.year) || { year: row.year, totalPayment: 0, totalPrincipal: 0, totalInterest: 0, endBalance: 0 };
        e.totalPayment += row.payment + row.pmi;
        e.totalPrincipal += row.principal;
        e.totalInterest += row.interest;
        e.endBalance = row.balance;
        yearMap.set(row.year, e);
      });
      return Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
    }
    return schedule.map((r) => ({ year: r.month, totalPayment: r.payment + r.pmi, totalPrincipal: r.principal, totalInterest: r.interest, endBalance: r.balance }));
  }, [schedule, view]);

  const visibleData = showAll ? displayData : displayData.slice(0, view === "yearly" ? 10 : 24);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Select value={view} onValueChange={(v) => setView(v as "monthly" | "yearly")}>
          <SelectTrigger className="w-28" data-testid="amort-view-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yearly">Yearly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" data-testid="amortization-table">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">{view === "yearly" ? "Year" : "Month"}</th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Payment</th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Principal</th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Interest</th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {visibleData.map((row) => (
              <tr key={row.year} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="py-2 px-3 font-mono tabular-nums">{row.year}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums">{formatCurrency(row.totalPayment)}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(row.totalPrincipal)}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(row.totalInterest)}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums">{formatCurrency(row.endBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {displayData.length > visibleData.length && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1 mx-auto" data-testid="show-all-amortization">
          Show all {displayData.length} {view === "yearly" ? "years" : "months"} <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      {showAll && displayData.length > 10 && (
        <button onClick={() => setShowAll(false)} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1 mx-auto">
          Show less <ChevronUp className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Utility Line Item ────────────────────────

function UtilityRow({
  icon: Icon,
  label,
  estimate,
  override,
  onOverride,
  testId,
}: {
  icon: any;
  label: string;
  estimate: number;
  override: number | null;
  onOverride: (val: number | null) => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const value = override ?? estimate;

  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm flex-1 min-w-0 truncate">{label}</span>
      {editing ? (
        <div className="relative w-24 shrink-0">
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            data-testid={testId}
            className="pl-6 h-8 text-sm font-mono tabular-nums"
            type="number"
            autoFocus
            defaultValue={value}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onOverride(v);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { onOverride(null); setEditing(false); }
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-mono tabular-nums text-right hover:text-primary transition-colors shrink-0"
          data-testid={testId}
        >
          {formatCurrency(value)}
          {override !== null && (
            <button
              onClick={(e) => { e.stopPropagation(); onOverride(null); }}
              className="ml-1 text-muted-foreground hover:text-destructive inline"
              title="Reset to estimate"
            >
              <X className="h-3 w-3 inline" />
            </button>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main Calculator Page ─────────────────────

export default function CalculatorPage() {
  // Dark mode
  const [darkMode, setDarkMode] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);

  // Property info
  const [propertyAddress, setPropertyAddress] = useState("15 Aspinwall Ct, Orinda, CA 94563");
  const [propertyBeds, setPropertyBeds] = useState(4);
  const [propertyBaths, setPropertyBaths] = useState(2);
  const [propertySqft, setPropertySqft] = useState(2260);
  const [propertyLotSize, setPropertyLotSize] = useState("0.5 Acres");

  // Mortgage inputs
  const [homePrice, setHomePrice] = useState(1890000);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.875);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [zipCode, setZipCode] = useState("94563");
  const [propertyTaxRate, setPropertyTaxRate] = useState(1.25);
  const [homeInsuranceAnnual, setHomeInsuranceAnnual] = useState(7560);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [pmiRate, setPmiRate] = useState(0.55);

  // Zip lookup state
  const [zipLookupState, setZipLookupState] = useState<string>("CA");
  const [zipLookupCounty, setZipLookupCounty] = useState<string>("Contra Costa");
  const [taxManuallyEdited, setTaxManuallyEdited] = useState(false);
  const [insuranceManuallyEdited, setInsuranceManuallyEdited] = useState(false);

  // Utility overrides
  const [elecOverride, setElecOverride] = useState<number | null>(null);
  const [gasOverride, setGasOverride] = useState<number | null>(null);
  const [waterOverride, setWaterOverride] = useState<number | null>(null);
  const [sewerOverride, setSewerOverride] = useState<number | null>(null);
  const [trashOverride, setTrashOverride] = useState<number | null>(null);
  const [internetOverride, setInternetOverride] = useState<number | null>(null);

  // Closing cost overrides
  const [ccLoanOriginationOverride, setCcLoanOriginationOverride] = useState<number | null>(null);
  const [ccAppraisalOverride, setCcAppraisalOverride] = useState<number | null>(null);
  const [ccCreditReportOverride, setCcCreditReportOverride] = useState<number | null>(null);
  const [ccTitleSearchOverride, setCcTitleSearchOverride] = useState<number | null>(null);
  const [ccLenderTitleInsOverride, setCcLenderTitleInsOverride] = useState<number | null>(null);
  const [ccOwnerTitleInsOverride, setCcOwnerTitleInsOverride] = useState<number | null>(null);
  const [ccEscrowFeeOverride, setCcEscrowFeeOverride] = useState<number | null>(null);
  const [ccRecordingFeeOverride, setCcRecordingFeeOverride] = useState<number | null>(null);
  const [ccTransferTaxOverride, setCcTransferTaxOverride] = useState<number | null>(null);
  const [ccHomeInspectionOverride, setCcHomeInspectionOverride] = useState<number | null>(null);
  const [ccPestInspectionOverride, setCcPestInspectionOverride] = useState<number | null>(null);
  const [ccSurveyOverride, setCcSurveyOverride] = useState<number | null>(null);
  const [ccAttorneyFeeOverride, setCcAttorneyFeeOverride] = useState<number | null>(null);
  const [ccPrepaidInterestOverride, setCcPrepaidInterestOverride] = useState<number | null>(null);

  // Active section
  const [activeSection, setActiveSection] = useState<"mortgage" | "utilities" | "closing">("mortgage");

  // Address just changed indicator
  const [addressJustChanged, setAddressJustChanged] = useState(false);
  const addressChangeTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Zip code auto-lookup
  const applyZipData = useCallback((zip: string, forceUpdate = false) => {
    if (zip.length === 5) {
      const data = lookupZipCodeData(zip);
      if (data) {
        setZipLookupState(data.state);
        setZipLookupCounty(data.county);
        if (!taxManuallyEdited || forceUpdate) {
          setPropertyTaxRate(data.taxRate);
        }
        if (!insuranceManuallyEdited || forceUpdate) {
          const baseHomeValue = 350000;
          const scaleFactor = Math.max(0.5, Math.min(3, homePrice / baseHomeValue));
          setHomeInsuranceAnnual(Math.round(data.insuranceAnnual * scaleFactor * 0.85));
        }
      }
    }
  }, [homePrice, taxManuallyEdited, insuranceManuallyEdited]);

  // Re-scale insurance when homePrice changes (unless manually edited)
  useEffect(() => {
    if (!insuranceManuallyEdited && homePrice > 0 && zipCode.length === 5) {
      const data = lookupZipCodeData(zipCode);
      if (data) {
        const baseHomeValue = 350000;
        const scaleFactor = Math.max(0.5, Math.min(3, homePrice / baseHomeValue));
        setHomeInsuranceAnnual(Math.round(data.insuranceAnnual * scaleFactor * 0.85));
      }
    }
  }, [homePrice, insuranceManuallyEdited, zipCode]);

  const handleZipChange = useCallback((newZip: string) => {
    setZipCode(newZip);
    applyZipData(newZip);
  }, [applyZipData]);

  // Address search handler
  const handleAddressSelect = useCallback((result: AddressResult) => {
    const addr = [result.street, result.city, result.stateCode, result.zipCode].filter(Boolean).join(", ");
    setPropertyAddress(addr);
    setZipCode(result.zipCode);
    if (result.stateCode) setZipLookupState(result.stateCode);
    if (result.county) setZipLookupCounty(result.county.replace(" County", ""));

    // Clear property-specific data that doesn't carry over between addresses
    setHomePrice(0);
    setPropertyBeds(0);
    setPropertyBaths(0);
    setPropertySqft(0);
    setPropertyLotSize("");
    setHoaMonthly(0);

    // Force update tax/insurance for new address
    setTaxManuallyEdited(false);
    setInsuranceManuallyEdited(false);
    
    // Reset utility overrides for new location
    setElecOverride(null);
    setGasOverride(null);
    setWaterOverride(null);
    setSewerOverride(null);
    setTrashOverride(null);
    setInternetOverride(null);

    // Reset closing cost overrides for new address
    setCcLoanOriginationOverride(null);
    setCcAppraisalOverride(null);
    setCcCreditReportOverride(null);
    setCcTitleSearchOverride(null);
    setCcLenderTitleInsOverride(null);
    setCcOwnerTitleInsOverride(null);
    setCcEscrowFeeOverride(null);
    setCcRecordingFeeOverride(null);
    setCcTransferTaxOverride(null);
    setCcHomeInspectionOverride(null);
    setCcPestInspectionOverride(null);
    setCcSurveyOverride(null);
    setCcAttorneyFeeOverride(null);
    setCcPrepaidInterestOverride(null);

    // Show address-changed prompt
    setAddressJustChanged(true);
    if (addressChangeTimeout.current) clearTimeout(addressChangeTimeout.current);
    addressChangeTimeout.current = setTimeout(() => setAddressJustChanged(false), 30000);

    // Apply zip data with cleared home price
    setTimeout(() => {
      const data = lookupZipCodeData(result.zipCode);
      if (data) {
        setPropertyTaxRate(data.taxRate);
        setZipLookupState(data.state);
        setZipLookupCounty(data.county);
        // Set a moderate insurance default since price is cleared
        setHomeInsuranceAnnual(Math.round(data.insuranceAnnual));
      }
    }, 50);
  }, []);

  // Build Zillow search URL for the current address
  const zillowSearchUrl = useMemo(() => {
    if (!propertyAddress) return null;
    return `https://www.zillow.com/homes/${encodeURIComponent(propertyAddress)}_rb/`;
  }, [propertyAddress]);

  // Mortgage calculations
  const inputs: MortgageInputs = useMemo(() => ({
    homePrice, downPaymentPercent, interestRate, loanTermYears, propertyTaxRate, homeInsuranceAnnual, hoaMonthly, pmiRate,
  }), [homePrice, downPaymentPercent, interestRate, loanTermYears, propertyTaxRate, homeInsuranceAnnual, hoaMonthly, pmiRate]);

  const breakdown = useMemo(() => calculateMonthlyPayment(inputs), [inputs]);
  const schedule = useMemo(() => generateAmortizationSchedule(inputs), [inputs]);

  // Utility calculations
  const utilityInputs: UtilityInputs = useMemo(() => ({
    stateCode: zipLookupState,
    squareFootage: propertySqft,
    bedrooms: propertyBeds,
    electricityOverride: elecOverride,
    gasOverride: gasOverride,
    waterOverride: waterOverride,
    sewerOverride: sewerOverride,
    trashOverride: trashOverride,
    internetOverride: internetOverride,
  }), [zipLookupState, propertySqft, propertyBeds, elecOverride, gasOverride, waterOverride, sewerOverride, trashOverride, internetOverride]);

  const utilities = useMemo(() => estimateUtilities(utilityInputs), [utilityInputs]);

  // Closing cost calculations
  const closingCostInputs: ClosingCostInputs = useMemo(() => ({
    homePrice,
    loanAmount: homePrice - (homePrice * downPaymentPercent / 100),
    stateCode: zipLookupState,
    loanOriginationOverride: ccLoanOriginationOverride,
    appraisalOverride: ccAppraisalOverride,
    creditReportOverride: ccCreditReportOverride,
    titleSearchOverride: ccTitleSearchOverride,
    lenderTitleInsuranceOverride: ccLenderTitleInsOverride,
    ownerTitleInsuranceOverride: ccOwnerTitleInsOverride,
    escrowFeeOverride: ccEscrowFeeOverride,
    recordingFeeOverride: ccRecordingFeeOverride,
    transferTaxOverride: ccTransferTaxOverride,
    homeInspectionOverride: ccHomeInspectionOverride,
    pestInspectionOverride: ccPestInspectionOverride,
    surveyOverride: ccSurveyOverride,
    attorneyFeeOverride: ccAttorneyFeeOverride,
    prepaidInterestOverride: ccPrepaidInterestOverride,
    includePrepaidTaxes: true,
    includePrepaidInsurance: true,
  }), [homePrice, downPaymentPercent, zipLookupState, ccLoanOriginationOverride, ccAppraisalOverride, ccCreditReportOverride, ccTitleSearchOverride, ccLenderTitleInsOverride, ccOwnerTitleInsOverride, ccEscrowFeeOverride, ccRecordingFeeOverride, ccTransferTaxOverride, ccHomeInspectionOverride, ccPestInspectionOverride, ccSurveyOverride, ccAttorneyFeeOverride, ccPrepaidInterestOverride]);

  const closingCosts = useMemo(() => estimateClosingCosts(closingCostInputs), [closingCostInputs]);

  const downPaymentAmount = homePrice * downPaymentPercent / 100;
  const loanAmount = homePrice - downPaymentAmount;
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalMonthlyCost = breakdown.total + utilities.total;

  // ─── Key Home Buying Metrics ───
  const pricePerSqft = propertySqft > 0 ? homePrice / propertySqft : 0;
  const totalCostOfOwnership = homePrice + totalInterest + closingCosts.totalClosingCosts + (breakdown.propertyTax + breakdown.homeInsurance + utilities.total) * loanTermYears * 12;
  const annualCost = totalMonthlyCost * 12;
  const breakEvenRentMonthly = breakdown.total; // monthly cost where renting equals buying (housing portion)
  const loanToValue = homePrice > 0 ? (loanAmount / homePrice) * 100 : 0;
  const totalMonthlyHousing = breakdown.total; // mortgage + tax + insurance (no utilities)
  // 5-year equity projection
  const fiveYearEquity = schedule.filter(r => r.month <= 60).reduce((sum, r) => sum + r.principal, 0) + downPaymentAmount;

  const cashToClose = downPaymentAmount + closingCosts.totalClosingCosts;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Home className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Home Cost Calculator</h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">Mortgage, taxes, insurance, and utilities</p>
            </div>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="theme-toggle"
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ─── Total Monthly Cost Hero ─── */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.02]">
          <CardContent className="py-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="text-center lg:text-left">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Total Estimated Monthly Cost</p>
                <p className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums" data-testid="text-total-monthly">
                  {homePrice > 0 ? formatCurrency(totalMonthlyCost) : <span className="text-muted-foreground text-3xl">Enter property details</span>}
                </p>
              </div>
              <div className="flex flex-wrap justify-center lg:justify-end gap-3">
                <div className="bg-card border border-border rounded-lg px-4 py-2.5 min-w-[140px]">
                  <p className="text-xs text-muted-foreground">Mortgage + Taxes</p>
                  <p className="text-lg font-semibold font-mono tabular-nums" data-testid="text-mortgage-subtotal">{homePrice > 0 ? formatCurrency(breakdown.total) : "—"}</p>
                </div>
                <div className="bg-card border border-border rounded-lg px-4 py-2.5 min-w-[140px]">
                  <p className="text-xs text-muted-foreground">Utilities</p>
                  <p className="text-lg font-semibold font-mono tabular-nums" data-testid="text-utilities-subtotal">{formatCurrency(utilities.total)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg px-4 py-2.5 min-w-[140px]">
                  <p className="text-xs text-muted-foreground">Cash to Close</p>
                  <p className="text-lg font-semibold font-mono tabular-nums" data-testid="text-cash-to-close">{homePrice > 0 ? formatCurrency(cashToClose) : "—"}</p>
                </div>
                {homePrice > 0 && propertySqft > 0 && (
                  <div className="bg-card border border-border rounded-lg px-4 py-2.5 min-w-[120px]">
                    <p className="text-xs text-muted-foreground">Price / Sqft</p>
                    <p className="text-lg font-semibold font-mono tabular-nums">{formatCurrency(pricePerSqft)}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Address Search ─── */}
        <Card>
          <CardContent className="py-4">
            <div className="space-y-3">
              <AddressSearch onSelect={handleAddressSelect} currentAddress={propertyAddress} />
              {propertyAddress && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-sm truncate">{propertyAddress}</span>
                    {zillowSearchUrl && (
                      <a
                        href={zillowSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0"
                        data-testid="link-zillow-search"
                      >
                        Zillow <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {propertyBeds > 0 && <Badge variant="secondary" className="text-xs font-normal">{propertyBeds} Bed</Badge>}
                    {propertyBaths > 0 && <Badge variant="secondary" className="text-xs font-normal">{propertyBaths} Bath</Badge>}
                    {propertySqft > 0 && <Badge variant="secondary" className="text-xs font-normal">{propertySqft.toLocaleString()} sqft</Badge>}
                    {propertyLotSize && <Badge variant="secondary" className="text-xs font-normal">{propertyLotSize}</Badge>}
                    {homePrice > 0 && propertySqft > 0 && <Badge variant="secondary" className="text-xs font-normal">{formatCurrency(pricePerSqft)}/sqft</Badge>}
                  </div>
                </div>
              )}

              {/* Prompt to update property details after address change */}
              {addressJustChanged && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/[0.06] border border-primary/20 animate-in fade-in slide-in-from-top-1 duration-300">
                  <Pencil className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium text-foreground">New address — enter property details from the listing</p>
                    <p className="text-muted-foreground">
                      Tax and insurance rates have been set for this ZIP code. Enter the home price, beds, baths, and sqft for this property.
                      {zillowSearchUrl && (
                        <> Find listing details on{" "}
                          <a href={zillowSearchUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                            Zillow <ExternalLink className="h-3 w-3 inline" />
                          </a>.
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setAddressJustChanged(false)}
                    className="p-0.5 hover:bg-muted rounded shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              {/* Editable property details */}
              <div className={`rounded-lg transition-all duration-500 ${addressJustChanged ? "ring-2 ring-primary/30 ring-offset-2 ring-offset-background p-2" : "pt-1"}`}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Home Price</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        data-testid="input-home-price-quick"
                        className="h-8 text-sm pl-7 font-mono tabular-nums"
                        value={homePrice.toLocaleString()}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          const num = parseInt(raw);
                          if (!isNaN(num)) setHomePrice(num);
                          else if (raw === "") setHomePrice(0);
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Beds</Label>
                    <Input data-testid="input-beds" type="number" min={0} max={20} value={propertyBeds} onChange={(e) => setPropertyBeds(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Baths</Label>
                    <Input data-testid="input-baths" type="number" min={0} max={20} step={0.5} value={propertyBaths} onChange={(e) => setPropertyBaths(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Sqft</Label>
                    <Input data-testid="input-sqft" type="number" min={0} value={propertySqft} onChange={(e) => setPropertySqft(parseInt(e.target.value) || 0)} className="h-8 text-sm font-mono tabular-nums" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">ZIP Code</Label>
                    <Input data-testid="input-zip-code" maxLength={5} value={zipCode} onChange={(e) => handleZipChange(e.target.value.replace(/\D/g, ""))} className="h-8 text-sm font-mono tabular-nums" />
                  </div>
                </div>
              </div>
              {zipLookupState && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Estimates for {zipLookupCounty ? `${zipLookupCounty}, ` : ""}{zipLookupState}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ─── Left Column: Inputs ─── */}
          <div className="lg:col-span-5 space-y-4">
            {/* Section Tabs */}
            <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as any)}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="mortgage" data-testid="tab-mortgage-inputs">Mortgage</TabsTrigger>
                <TabsTrigger value="utilities" data-testid="tab-utilities-inputs">Utilities</TabsTrigger>
                <TabsTrigger value="closing" data-testid="tab-closing-inputs">Closing Costs</TabsTrigger>
              </TabsList>

              {/* ─── Mortgage Inputs ─── */}
              <TabsContent value="mortgage" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Home className="h-4 w-4 text-primary" />
                      Purchase Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <Label htmlFor="home-price" className="text-xs font-medium text-muted-foreground mb-1.5 block">Home Price</Label>
                      <CurrencyInput id="home-price" data-testid="input-home-price" value={homePrice} onChange={setHomePrice} />
                      <Slider className="mt-3" value={[homePrice]} onValueChange={([v]) => setHomePrice(v)} min={50000} max={5000000} step={5000} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label htmlFor="down-payment" className="text-xs font-medium text-muted-foreground">Down Payment</Label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatCurrency(downPaymentAmount)}</span>
                      </div>
                      <PercentInput id="down-payment" data-testid="input-down-payment" value={downPaymentPercent} onChange={(v) => setDownPaymentPercent(Math.min(100, Math.max(0, v)))} step={1} />
                      <Slider className="mt-3" value={[downPaymentPercent]} onValueChange={([v]) => setDownPaymentPercent(v)} min={0} max={50} step={1} />
                      {downPaymentPercent < 20 && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-center gap-1"><Info className="h-3 w-3" />PMI required (down payment under 20%)</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Loan Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <Label htmlFor="interest-rate" className="text-xs font-medium text-muted-foreground mb-1.5 block">Interest Rate</Label>
                      <PercentInput id="interest-rate" data-testid="input-interest-rate" value={interestRate} onChange={setInterestRate} step={0.125} />
                      <Slider className="mt-3" value={[interestRate]} onValueChange={([v]) => setInterestRate(Math.round(v * 1000) / 1000)} min={1} max={12} step={0.125} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Loan Term</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[15, 20, 30].map((term) => (
                          <button key={term} data-testid={`btn-term-${term}`} onClick={() => setLoanTermYears(term)}
                            className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${loanTermYears === term ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}>
                            {term} years
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Tax, Insurance & Fees</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label htmlFor="tax-rate" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          Property Tax Rate
                          <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">Auto-filled based on ZIP code.</TooltipContent></Tooltip>
                        </Label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatCurrency(homePrice * propertyTaxRate / 100)}/yr</span>
                      </div>
                      <PercentInput id="tax-rate" data-testid="input-tax-rate" value={propertyTaxRate} onChange={(v) => { setPropertyTaxRate(v); setTaxManuallyEdited(true); }} step={0.01} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label htmlFor="insurance" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          Home Insurance (annual)
                          <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">Estimated based on ZIP code and home value.</TooltipContent></Tooltip>
                        </Label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatCurrency(homeInsuranceAnnual / 12)}/mo</span>
                      </div>
                      <CurrencyInput id="insurance" data-testid="input-insurance" value={homeInsuranceAnnual} onChange={(v) => { setHomeInsuranceAnnual(v); setInsuranceManuallyEdited(true); }} />
                    </div>
                    <div>
                      <Label htmlFor="hoa" className="text-xs font-medium text-muted-foreground mb-1.5 block">HOA (monthly)</Label>
                      <CurrencyInput id="hoa" data-testid="input-hoa" value={hoaMonthly} onChange={setHoaMonthly} />
                    </div>
                    {downPaymentPercent < 20 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="pmi" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            PMI Rate
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[240px] text-xs">Required when down payment is under 20%. Drops off at 20% equity.</TooltipContent></Tooltip>
                          </Label>
                          <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatCurrency(loanAmount * pmiRate / 100 / 12)}/mo</span>
                        </div>
                        <PercentInput id="pmi" data-testid="input-pmi-rate" value={pmiRate} onChange={setPmiRate} step={0.05} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Utilities Inputs ─── */}
              <TabsContent value="utilities" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Monthly Utilities
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Estimated for a {propertySqft.toLocaleString()} sqft, {propertyBeds}-bed home in {zipLookupState || "US"}.
                      Click any amount to edit.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="divide-y divide-border">
                      <UtilityRow icon={Zap} label="Electricity" estimate={estimateUtilities({ ...utilityInputs, electricityOverride: null }).electricity} override={elecOverride} onOverride={setElecOverride} testId="utility-electricity" />
                      <UtilityRow icon={Flame} label="Natural Gas" estimate={estimateUtilities({ ...utilityInputs, gasOverride: null }).gas} override={gasOverride} onOverride={setGasOverride} testId="utility-gas" />
                      <UtilityRow icon={Droplets} label="Water" estimate={estimateUtilities({ ...utilityInputs, waterOverride: null }).water} override={waterOverride} onOverride={setWaterOverride} testId="utility-water" />
                      <UtilityRow icon={Droplets} label="Sewer" estimate={estimateUtilities({ ...utilityInputs, sewerOverride: null }).sewer} override={sewerOverride} onOverride={setSewerOverride} testId="utility-sewer" />
                      <UtilityRow icon={Trash2} label="Trash Collection" estimate={estimateUtilities({ ...utilityInputs, trashOverride: null }).trash} override={trashOverride} onOverride={setTrashOverride} testId="utility-trash" />
                      <UtilityRow icon={Wifi} label="Internet" estimate={estimateUtilities({ ...utilityInputs, internetOverride: null }).internet} override={internetOverride} onOverride={setInternetOverride} testId="utility-internet" />
                    </div>
                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
                      <span className="text-sm font-semibold">Total Utilities</span>
                      <span className="text-sm font-mono tabular-nums font-bold" data-testid="text-utilities-total">{formatCurrency(utilities.total)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">How are these estimated?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-xs text-muted-foreground space-y-1.5">
                      <li className="flex gap-2"><span className="text-primary font-bold">·</span>Electricity and gas scale with home square footage</li>
                      <li className="flex gap-2"><span className="text-primary font-bold">·</span>Water and sewer scale with number of bedrooms (occupancy estimate)</li>
                      <li className="flex gap-2"><span className="text-primary font-bold">·</span>Trash and internet are flat regional averages</li>
                      <li className="flex gap-2"><span className="text-primary font-bold">·</span>All base rates are state-level averages from EIA and Move.org 2025 data</li>
                      <li className="flex gap-2"><span className="text-primary font-bold">·</span>Click any amount to override with your actual cost</li>
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Closing Costs Inputs ─── */}
              <TabsContent value="closing" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      Estimated Closing Costs
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      One-time costs due at closing. Click any amount to override with your actual quote.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-4">
                    {/* Lender Fees */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Lender Fees</p>
                      <div className="divide-y divide-border">
                        <UtilityRow icon={DollarSign} label="Loan Origination" estimate={estimateClosingCosts({...closingCostInputs, loanOriginationOverride: null}).loanOrigination} override={ccLoanOriginationOverride} onOverride={setCcLoanOriginationOverride} testId="cc-loan-origination" />
                        <UtilityRow icon={FileText} label="Appraisal" estimate={estimateClosingCosts({...closingCostInputs, appraisalOverride: null}).appraisal} override={ccAppraisalOverride} onOverride={setCcAppraisalOverride} testId="cc-appraisal" />
                        <UtilityRow icon={FileText} label="Credit Report" estimate={estimateClosingCosts({...closingCostInputs, creditReportOverride: null}).creditReport} override={ccCreditReportOverride} onOverride={setCcCreditReportOverride} testId="cc-credit-report" />
                      </div>
                      <div className="flex justify-between pt-1 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(closingCosts.totalLenderFees)}</span>
                      </div>
                    </div>
                    {/* Title & Escrow */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Title & Escrow</p>
                      <div className="divide-y divide-border">
                        <UtilityRow icon={Search} label="Title Search" estimate={estimateClosingCosts({...closingCostInputs, titleSearchOverride: null}).titleSearch} override={ccTitleSearchOverride} onOverride={setCcTitleSearchOverride} testId="cc-title-search" />
                        <UtilityRow icon={Shield} label="Lender's Title Ins." estimate={estimateClosingCosts({...closingCostInputs, lenderTitleInsuranceOverride: null}).lenderTitleInsurance} override={ccLenderTitleInsOverride} onOverride={setCcLenderTitleInsOverride} testId="cc-lender-title" />
                        <UtilityRow icon={Shield} label="Owner's Title Ins." estimate={estimateClosingCosts({...closingCostInputs, ownerTitleInsuranceOverride: null}).ownerTitleInsurance} override={ccOwnerTitleInsOverride} onOverride={setCcOwnerTitleInsOverride} testId="cc-owner-title" />
                        <UtilityRow icon={DollarSign} label="Escrow Fee" estimate={estimateClosingCosts({...closingCostInputs, escrowFeeOverride: null}).escrowFee} override={ccEscrowFeeOverride} onOverride={setCcEscrowFeeOverride} testId="cc-escrow" />
                      </div>
                      <div className="flex justify-between pt-1 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(closingCosts.totalTitleEscrow)}</span>
                      </div>
                    </div>
                    {/* Government Fees */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Government Fees</p>
                      <div className="divide-y divide-border">
                        <UtilityRow icon={FileText} label="Recording Fee" estimate={estimateClosingCosts({...closingCostInputs, recordingFeeOverride: null}).recordingFee} override={ccRecordingFeeOverride} onOverride={setCcRecordingFeeOverride} testId="cc-recording" />
                        <UtilityRow icon={FileText} label="Transfer Tax" estimate={estimateClosingCosts({...closingCostInputs, transferTaxOverride: null}).transferTax} override={ccTransferTaxOverride} onOverride={setCcTransferTaxOverride} testId="cc-transfer-tax" />
                      </div>
                      <div className="flex justify-between pt-1 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(closingCosts.totalGovernment)}</span>
                      </div>
                    </div>
                    {/* Inspections */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Inspections</p>
                      <div className="divide-y divide-border">
                        <UtilityRow icon={Search} label="Home Inspection" estimate={estimateClosingCosts({...closingCostInputs, homeInspectionOverride: null}).homeInspection} override={ccHomeInspectionOverride} onOverride={setCcHomeInspectionOverride} testId="cc-home-inspection" />
                        <UtilityRow icon={Search} label="Pest Inspection" estimate={estimateClosingCosts({...closingCostInputs, pestInspectionOverride: null}).pestInspection} override={ccPestInspectionOverride} onOverride={setCcPestInspectionOverride} testId="cc-pest-inspection" />
                        <UtilityRow icon={Search} label="Survey" estimate={estimateClosingCosts({...closingCostInputs, surveyOverride: null}).survey} override={ccSurveyOverride} onOverride={setCcSurveyOverride} testId="cc-survey" />
                      </div>
                      <div className="flex justify-between pt-1 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(closingCosts.totalInspections)}</span>
                      </div>
                    </div>
                    {/* Other */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Other</p>
                      <div className="divide-y divide-border">
                        <UtilityRow icon={FileText} label="Attorney Fee" estimate={estimateClosingCosts({...closingCostInputs, attorneyFeeOverride: null}).attorneyFee} override={ccAttorneyFeeOverride} onOverride={setCcAttorneyFeeOverride} testId="cc-attorney" />
                        <UtilityRow icon={DollarSign} label="Prepaid Interest (~15 days)" estimate={estimateClosingCosts({...closingCostInputs, prepaidInterestOverride: null}).prepaidInterest} override={ccPrepaidInterestOverride} onOverride={setCcPrepaidInterestOverride} testId="cc-prepaid-interest" />
                      </div>
                      <div className="flex justify-between pt-1 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(closingCosts.totalOther)}</span>
                      </div>
                    </div>
                    {/* Total */}
                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
                      <div>
                        <span className="text-sm font-semibold">Total Closing Costs</span>
                        {homePrice > 0 && <span className="text-xs text-muted-foreground ml-2">({closingCostPercentage(closingCosts.totalClosingCosts, homePrice)} of price)</span>}
                      </div>
                      <span className="text-sm font-mono tabular-nums font-bold" data-testid="text-closing-total">{formatCurrency(closingCosts.totalClosingCosts)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-semibold text-primary">Cash to Close</span>
                      <span className="text-sm font-mono tabular-nums font-bold text-primary" data-testid="text-cash-to-close-detail">{homePrice > 0 ? formatCurrency(cashToClose) : "—"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Down payment ({formatCurrency(downPaymentAmount)}) + closing costs ({formatCurrency(closingCosts.totalClosingCosts)})</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* ─── Right Column: Results ─── */}
          <div className="lg:col-span-7 space-y-4">
            {/* Payment Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Monthly Payment Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PaymentPieChart breakdown={breakdown} />
                  <div className="space-y-2 flex flex-col justify-center">
                    {[
                      { label: "Principal & Interest", value: breakdown.principalAndInterest, color: PIE_COLORS[0] },
                      { label: "Property Tax", value: breakdown.propertyTax, color: PIE_COLORS[1] },
                      { label: "Home Insurance", value: breakdown.homeInsurance, color: PIE_COLORS[2] },
                      ...(breakdown.pmi > 0 ? [{ label: "PMI", value: breakdown.pmi, color: PIE_COLORS[3] }] : []),
                      ...(breakdown.hoa > 0 ? [{ label: "HOA", value: breakdown.hoa, color: PIE_COLORS[4] }] : []),
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-sm text-muted-foreground truncate">{item.label}</span>
                        </div>
                        <span className="text-sm font-mono tabular-nums font-medium whitespace-nowrap">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Housing Subtotal</span>
                        <span className="text-sm font-mono tabular-nums font-bold">{formatCurrency(breakdown.total)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm text-muted-foreground">+ Utilities</span>
                        <span className="text-sm font-mono tabular-nums text-muted-foreground">{formatCurrency(utilities.total)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                        <span className="text-sm font-bold">Total Monthly</span>
                        <span className="text-base font-mono tabular-nums font-bold text-primary">{formatCurrency(totalMonthlyCost)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                  {homePrice > 0 && propertySqft > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Price / Sqft</p>
                      <p className="font-semibold text-sm font-mono tabular-nums">{formatCurrency(pricePerSqft)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Loan Amount</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? formatCurrency(loanAmount) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Loan-to-Value</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? `${loanToValue.toFixed(0)}%` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Total Interest Paid</p>
                    <p className="font-semibold text-sm font-mono tabular-nums text-orange-600 dark:text-orange-400">{homePrice > 0 ? formatCurrency(totalInterest) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">5-Year Equity</p>
                    <p className="font-semibold text-sm font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{homePrice > 0 ? formatCurrency(fiveYearEquity) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Annual Cost</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? formatCurrency(annualCost) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Break-Even Rent</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? `${formatCurrency(totalMonthlyHousing)}/mo` : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Rent above this favors buying</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Payoff Date</p>
                    <p className="font-semibold text-sm">{new Date(Date.now() + loanTermYears * 365.25 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Total Cost of Ownership</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? formatCurrency(totalCostOfOwnership) : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Purchase + interest + taxes + insurance + utilities</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Closing Costs</p>
                    <p className="font-semibold text-sm font-mono tabular-nums">{homePrice > 0 ? formatCurrency(closingCosts.totalClosingCosts) : "—"}</p>
                    {homePrice > 0 && <p className="text-[10px] text-muted-foreground">{closingCostPercentage(closingCosts.totalClosingCosts, homePrice)} of purchase price</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Cash to Close</p>
                    <p className="font-semibold text-sm font-mono tabular-nums text-primary">{homePrice > 0 ? formatCurrency(cashToClose) : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Down payment + closing costs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <Tabs defaultValue="equity" className="w-full">
              <TabsList className="mb-3">
                <TabsTrigger value="equity" data-testid="tab-equity">Equity Buildup</TabsTrigger>
                <TabsTrigger value="breakdown" data-testid="tab-breakdown">Interest vs Principal</TabsTrigger>
              </TabsList>
              <TabsContent value="equity">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Home Equity Over Time</CardTitle></CardHeader>
                  <CardContent><EquityChart schedule={schedule} /></CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="breakdown">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Annual Principal vs Interest</CardTitle></CardHeader>
                  <CardContent><InterestVsPrincipalChart schedule={schedule} /></CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Amortization Schedule */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Amortization Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AmortizationTable schedule={schedule} />
              </CardContent>
            </Card>
          </div>
        </div>

        <PerplexityAttribution />
      </main>
    </div>
  );
}
