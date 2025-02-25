import { createResource, createSignal, createMemo, Show, For } from "solid-js";
import { readCSV } from "~/utils/csvParser";

interface CSVRow {
  no: string;
  nama: string;
  amount: string;
  status: string;
  "month.year": string; // This field contains the month/year like "02/2025"
  [key: string]: string;
}

interface ExpenseRow {
  id: string;
  tanggal: string;
  nama: string;
  foto: string;
  harga: string;
  [key: string]: string;
}

// Parse month/year from the CSV into a readable format
const formatMonthYear = (monthYear: string): string => {
  try {
    const [month, year] = monthYear.split("/");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
  } catch (e) {
    return monthYear; // Return original if parsing fails
  }
};

// Format a date string (YYYY-MM-DD) to localized format
const formatDate = (dateStr: string): string => {
  try {
    const [year, month, day] = dateStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return dateStr; // Return original if parsing fails
  }
};

const fetchCSVData = async (): Promise<CSVRow[]> => {
  try {
    const response = await fetch("/data.csv");
    if (!response.ok) throw new Error("Failed to fetch CSV data");
    const text = await response.text();
    return readCSV(text) as CSVRow[];
  } catch (error) {
    console.error("Error fetching CSV data:", error);
    return [];
  }
};

const fetchExpensesData = async (): Promise<ExpenseRow[]> => {
  try {
    const response = await fetch("/pengeluaran.csv");
    if (!response.ok) throw new Error("Failed to fetch expenses data");
    const text = await response.text();
    return readCSV(text) as ExpenseRow[];
  } catch (error) {
    console.error("Error fetching expenses data:", error);
    return [];
  }
};

export default function CashManagement() {
  const [cashData, { refetch: refetchCash }] = createResource(fetchCSVData);
  const [expensesData, { refetch: refetchExpenses }] = createResource(fetchExpensesData);
  
  const [searchTerm, setSearchTerm] = createSignal("");
  const [expenseSearchTerm, setExpenseSearchTerm] = createSignal("");
  const [sortField, setSortField] = createSignal<keyof CSVRow>("no");
  const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">("asc");
  const [expenseSortField, setExpenseSortField] = createSignal<keyof ExpenseRow>("tanggal");
  const [expenseSortDirection, setExpenseSortDirection] = createSignal<"asc" | "desc">("desc");
  const [selectedMonth, setSelectedMonth] = createSignal<string | null>(null);
  
  // Get all available months from the data
  const availableMonths = createMemo(() => {
    if (!cashData()) return [];
    
    const months = new Set<string>();
    cashData()!.forEach(row => {
      if (row["month.year"]) {
        months.add(row["month.year"]);
      }
    });
    
    return Array.from(months).sort((a, b) => {
      // Sort by year then month (MM/YYYY format)
      const [monthA, yearA] = a.split("/");
      const [monthB, yearB] = b.split("/");
      
      if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
      return parseInt(monthA) - parseInt(monthB);
    });
  });
  
  // When data loads, automatically select the most recent month if none selected
  createMemo(() => {
    if (cashData() && availableMonths().length > 0 && !selectedMonth()) {
      setSelectedMonth(availableMonths()[availableMonths().length - 1]);
    }
  });
  
  // Filter and sort cash data based on selected month and search term
  const filteredCashData = createMemo((): CSVRow[] => {
    if (!cashData()) return [];
    
    let filtered = cashData()!;
    
    // Filter by selected month if one is selected
    if (selectedMonth()) {
      filtered = filtered.filter(row => row["month.year"] === selectedMonth());
    }
    
    // Filter by search term
    if (searchTerm()) {
      filtered = filtered.filter(row => 
        row.nama.toLowerCase().includes(searchTerm().toLowerCase())
      );
    }
    
    // Sort the data
    return filtered.sort((a, b) => {
      const field = sortField();
      const direction = sortDirection() === "asc" ? 1 : -1;
      
      if (field === "amount") {
        return (parseInt(a[field]) - parseInt(b[field])) * direction;
      } else {
        return String(a[field]).localeCompare(String(b[field])) * direction;
      }
    });
  });

  // Filter and sort expenses data based on selected month and search term
  const filteredExpensesData = createMemo((): ExpenseRow[] => {
    if (!expensesData()) return [];
    
    let filtered = expensesData()!;
    
    // Filter by selected month if one is selected
    if (selectedMonth()) {
      const [month, year] = selectedMonth()?.split("/") || [];
      if (month && year) { // Add null check
        const monthYear = `${year}-${month.padStart(2, '0')}`;
        filtered = filtered.filter(row => row.tanggal?.startsWith(monthYear)); // Add optional chaining
      }
    }
    
    // Filter by search term
    if (expenseSearchTerm()) {
      filtered = filtered.filter(row => 
        row.nama?.toLowerCase().includes(expenseSearchTerm().toLowerCase()) // Add optional chaining
      );
    }
    
    // Sort the data
    return filtered.sort((a, b) => {
      const field = expenseSortField();
      const direction = expenseSortDirection() === "asc" ? 1 : -1;
      
      if (field === "harga") {
        return (parseInt(a[field] || "0") - parseInt(b[field] || "0")) * direction; // Add fallback for parsing
      } else if (field === "tanggal") {
        return (a[field] || "").localeCompare(b[field] || "") * direction; // Add null checks
      } else {
        return String(a[field] || "").localeCompare(String(b[field] || "")) * direction; // Add null checks
      }
    });
  });
  
  // Calculate totals and balance
  const financialSummary = createMemo(() => {
    const totalIncome = filteredCashData().reduce((sum, row) => {
      // Only count paid amounts (status = 1)
      if (row.status === "1") {
        return sum + parseInt(row.amount || "0");
      }
      return sum;
    }, 0);
    
    const totalExpenses = filteredExpensesData().reduce((sum, row) => 
      sum + parseInt(row.harga || "0"), 0);
    
    const balance = totalIncome - totalExpenses;
    
    return {
      totalIncome,
      totalExpenses,
      balance
    };
  });
  
  // Toggle sort direction when clicking on a column header
  const handleSort = (field: keyof CSVRow) => {
    if (sortField() === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Toggle sort direction for expenses when clicking on a column header
  const handleExpenseSort = (field: keyof ExpenseRow) => {
    if (expenseSortField() === field) {
      setExpenseSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setExpenseSortField(field);
      setExpenseSortDirection("asc");
    }
  };
  
  // Get sort icon based on current sort state
  const getSortIcon = (field: keyof CSVRow) => {
    if (sortField() !== field) return "↕️";
    return sortDirection() === "asc" ? "↑" : "↓";
  };

  // Get sort icon based on current expense sort state
  const getExpenseSortIcon = (field: keyof ExpenseRow) => {
    if (expenseSortField() !== field) return "↕️";
    return expenseSortDirection() === "asc" ? "↑" : "↓";
  };

  // Format status as badge instead of checkbox
  const formatStatus = (status: string) => {
    return status === "1" 
      ? <span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Lunas</span>
      : <span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Belum</span>;
  };

  // Refresh both data sources
  const refreshAllData = () => {
    refetchCash();
    refetchExpenses();
  };

  return (
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex flex-col md:flex-row gap-6">
        {/* Left side - Kas (Cash) */}
        <div class="w-full md:w-3/5 bg-white rounded-lg shadow-md p-6">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h1 class="text-2xl font-bold text-gray-800">
              Kas {selectedMonth() ? formatMonthYear(selectedMonth()!) : "Semua Bulan"}
            </h1>
            
            <div class="flex flex-wrap gap-2">
              <select 
                value={selectedMonth() || ""}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                class="px-3 py-2 border border-gray-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Bulan</option>
                <For each={availableMonths()}>
                  {(month) => (
                    <option value={month}>{formatMonthYear(month)}</option>
                  )}
                </For>
              </select>
              
              <button 
                onClick={refreshAllData} 
                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition duration-200 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
          
          <div class="mb-4">
            <div class="relative">
              <input
                type="text"
                placeholder="Cari berdasarkan nama..."
                value={searchTerm()}
                onInput={(e: InputEvent) => setSearchTerm((e.target as HTMLInputElement).value)}
                class="w-full px-4 py-2 border border-gray-300 rounded-md pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <Show when={!cashData.loading} fallback={
            <div class="flex justify-center items-center h-64">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          }>
            <div class="overflow-x-auto rounded-lg border border-gray-200">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="bg-gray-100">
                    <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleSort("no")}>
                      <div class="flex items-center">
                        No <span class="ml-1 text-gray-400">{getSortIcon("no")}</span>
                      </div>
                    </th>
                    <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleSort("nama")}>
                      <div class="flex items-center">
                        Nama <span class="ml-1 text-gray-400">{getSortIcon("nama")}</span>
                      </div>
                    </th>
                    <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleSort("amount")}>
                      <div class="flex items-center">
                        Amount <span class="ml-1 text-gray-400">{getSortIcon("amount")}</span>
                      </div>
                    </th>
                    <Show when={!selectedMonth()}>
                      <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleSort("month.year")}>
                        <div class="flex items-center">
                          Bulan <span class="ml-1 text-gray-400">{getSortIcon("month.year")}</span>
                        </div>
                      </th>
                    </Show>
                    <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleSort("status")}>
                      <div class="flex items-center justify-center">
                        Status <span class="ml-1 text-gray-400">{getSortIcon("status")}</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={filteredCashData().length > 0} fallback={
                    <tr>
                      <td colspan={selectedMonth() ? 4 : 5} class="p-4 text-center text-gray-500">
                        Tidak ada data yang ditemukan
                      </td>
                    </tr>
                  }>
                    {filteredCashData().map((row, index) => (
                      <tr class={index % 2 === 0 ? "bg-white" : "bg-gray-50"} 
                          classList={{"bg-blue-50 hover:bg-blue-100": row.status === "1", "hover:bg-gray-100": row.status !== "1"}}>
                        <td class="p-3 text-sm text-gray-700 border-t">{row.no}</td>
                        <td class="p-3 text-sm text-gray-700 font-medium border-t">{row.nama}</td>
                        <td class="p-3 text-sm text-gray-700 border-t">{formatCurrency(row.amount)}</td>
                        <Show when={!selectedMonth()}>
                          <td class="p-3 text-sm text-gray-700 border-t">{formatMonthYear(row["month.year"])}</td>
                        </Show>
                        <td class="p-3 text-center border-t">
                          {formatStatus(row.status)}
                        </td>
                      </tr>
                    ))}
                  </Show>
                </tbody>
              </table>
            </div>
            
            <div class="mt-4 text-sm text-gray-500 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <span>Total: {filteredCashData().length} entries</span>
              <div>
                <span class="font-medium">Total Lunas: </span>
                {formatCurrency(
                  filteredCashData()
                    .filter(row => row.status === "1")
                    .reduce((sum, row) => sum + parseInt(row.amount || "0"), 0)
                    .toString()
                )}
              </div>
            </div>
          </Show>
        </div>
        
        {/* Right side - Financial Summary and Expenses */}
        <div class="w-full md:w-2/5 flex flex-col gap-6">
          {/* Financial Summary */}
          <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">Ringkasan Keuangan</h2>
            
            <div class="grid grid-cols-1 gap-4">
              <div class="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div class="text-sm text-blue-600 font-medium">Total Pemasukan (Lunas)</div>
                <div class="text-2xl font-bold text-blue-700">{formatCurrency(financialSummary().totalIncome.toString())}</div>
              </div>
              
              <div class="p-4 bg-red-50 rounded-lg border border-red-100">
                <div class="text-sm text-red-600 font-medium">Total Pengeluaran</div>
                <div class="text-2xl font-bold text-red-700">{formatCurrency(financialSummary().totalExpenses.toString())}</div>
              </div>
              
              <div class="p-4 bg-green-50 rounded-lg border border-green-100">
                <div class="text-sm text-green-600 font-medium">Sisa Kas</div>
                <div class="text-2xl font-bold text-green-700">{formatCurrency(financialSummary().balance.toString())}</div>
              </div>
            </div>
          </div>
          
          {/* Expenses */}
          <div class="bg-white rounded-lg shadow-md p-6 flex-grow">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold text-gray-800">Pengeluaran</h2>
            </div>
            
            <div class="mb-4">
              <div class="relative">
                <input
                  type="text"
                  placeholder="Cari pengeluaran..."
                  value={expenseSearchTerm()}
                  onInput={(e: InputEvent) => setExpenseSearchTerm((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-2 border border-gray-300 rounded-md pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            
            <Show when={!expensesData.loading} fallback={
              <div class="flex justify-center items-center h-40">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
              </div>
            }>
              <div class="overflow-x-auto rounded-lg border border-gray-200">
                <table class="w-full border-collapse">
                  <thead>
                    <tr class="bg-gray-100">
                      <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleExpenseSort("tanggal")}>
                        <div class="flex items-center">
                          Tanggal <span class="ml-1 text-gray-400">{getExpenseSortIcon("tanggal")}</span>
                        </div>
                      </th>
                      <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleExpenseSort("nama")}>
                        <div class="flex items-center">
                          Nama <span class="ml-1 text-gray-400">{getExpenseSortIcon("nama")}</span>
                        </div>
                      </th>
                      <th class="p-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-200" onClick={() => handleExpenseSort("harga")}>
                        <div class="flex items-center">
                          Harga <span class="ml-1 text-gray-400">{getExpenseSortIcon("harga")}</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <Show when={filteredExpensesData().length > 0} fallback={
                      <tr>
                        <td colspan={3} class="p-4 text-center text-gray-500">
                          Tidak ada pengeluaran yang ditemukan
                        </td>
                      </tr>
                    }>
                      {filteredExpensesData().map((row, index) => (
                        <tr class={index % 2 === 0 ? "bg-white" : "bg-gray-50"} 
                            classList={{"hover:bg-red-50": true}}>
                          <td class="p-3 text-sm text-gray-700 border-t">{formatDate(row.tanggal)}</td>
                          <td class="p-3 text-sm border-t">
                            <div class="flex items-center">
                              <Show when={row.foto}>
                                <img 
                                  src={`/`+ row.id} 
                                  alt={row.nama} 
                                  class="h-8 w-8 mr-2 rounded-full object-cover"
                                />
                              </Show>
                              <span class="font-medium text-gray-700">{row.nama}</span>
                            </div>
                          </td>
                          <td class="p-3 text-sm text-gray-700 border-t">{formatCurrency(row.harga)}</td>
                        </tr>
                      ))}
                    </Show>
                  </tbody>
                </table>
              </div>
              
              <div class="mt-4 text-sm text-gray-500 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <span>Total: {filteredExpensesData().length} entries</span>
                <div>
                  <span class="font-medium">Total Pengeluaran: </span>
                  {formatCurrency(
                    filteredExpensesData().reduce((sum, row) => sum + parseInt(row.harga || "0"), 0).toString()
                  )}
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: string): string {
  return `Rp. ${parseInt(amount || "0").toLocaleString("id-ID")}`;
}