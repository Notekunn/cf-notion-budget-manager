import type { MonthlyTrend, BudgetChartData } from './chart-data-service';

const CDN = 'https://cdn.jsdelivr.net/npm/chart.js';
const VND_FMT = "new Intl.NumberFormat('vi-VN')";
const VND_COMPACT = "new Intl.NumberFormat('vi-VN',{notation:'compact'})";

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlPage(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><script src="${CDN}"></script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:16px;background:#fff}
.cc{position:relative;width:100%;max-width:800px;margin:0 auto 24px}
h2{text-align:center;color:#333;margin:8px 0 12px;font-size:1.1em}
.rb{display:block;margin:8px auto;padding:6px 16px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f8f8f8}
.rb:hover{background:#eee}
.no-data{text-align:center;color:#999;padding:40px;font-size:1.1em}
</style></head><body>
<!--button class="rb" onclick="location.reload()">&#8635; Refresh</button-->
${body}
</body></html>`;
}

export function renderNoData(message: string): string {
	return htmlPage('No Data', `<div class="no-data">${esc(message)}</div>`);
}

export function renderTrendsChart(trends: MonthlyTrend[]): string {
	const labels = JSON.stringify(trends.map((t) => t.month));
	const income = JSON.stringify(trends.map((t) => t.income));
	const spending = JSON.stringify(trends.map((t) => t.spending));
	const body = `<div class="cc"><h2>Monthly Income vs Spending</h2><canvas id="c1"></canvas></div>
<script>new Chart(document.getElementById('c1'),{type:'bar',data:{labels:${labels},datasets:[
{label:'Income',data:${income},backgroundColor:'rgba(75,192,192,0.7)',borderColor:'rgb(75,192,192)',borderWidth:1},
{label:'Spending',data:${spending},backgroundColor:'rgba(255,99,132,0.7)',borderColor:'rgb(255,99,132)',borderWidth:1}
]},options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+${VND_FMT}.format(c.raw)+' VND'}}},
scales:{y:{beginAtZero:true,ticks:{callback:v=>${VND_COMPACT}.format(v)}}}}});</script>`;
	return htmlPage('Spending Trends', body);
}

export function renderCategoriesChart(budget: BudgetChartData): string {
	const labels = JSON.stringify(budget.jars.map((j) => j.name));
	const data = JSON.stringify(budget.jars.map((j) => j.actual));
	const n = budget.jars.length;
	const colors = JSON.stringify(budget.jars.map((_, i) => `hsl(${Math.round((i * 360) / n)},70%,60%)`));
	const safeMonth = esc(budget.month);
	const body = `<div class="cc"><h2>Spending by Category &mdash; ${safeMonth}</h2><canvas id="c1"></canvas></div>
<script>new Chart(document.getElementById('c1'),{type:'doughnut',data:{labels:${labels},datasets:[{data:${data},backgroundColor:${colors}}]},
options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.label+': '+${VND_FMT}.format(c.raw)+' VND'}}}}});</script>`;
	return htmlPage(`Categories — ${safeMonth}`, body);
}

export function renderBudgetChart(budget: BudgetChartData): string {
	const labels = JSON.stringify(budget.jars.map((j) => j.name));
	const budgetData = JSON.stringify(budget.jars.map((j) => j.budget));
	const actualData = JSON.stringify(budget.jars.map((j) => j.actual));
	const safeMonth = esc(budget.month);
	const body = `<div class="cc"><h2>Budget vs Actual &mdash; ${safeMonth}</h2><canvas id="c1"></canvas></div>
<script>new Chart(document.getElementById('c1'),{type:'bar',data:{labels:${labels},datasets:[
{label:'Budget',data:${budgetData},backgroundColor:'rgba(54,162,235,0.7)',borderColor:'rgb(54,162,235)',borderWidth:1},
{label:'Actual',data:${actualData},backgroundColor:'rgba(255,159,64,0.7)',borderColor:'rgb(255,159,64)',borderWidth:1}
]},options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+${VND_FMT}.format(c.raw)+' VND'}}},
scales:{y:{beginAtZero:true,ticks:{callback:v=>${VND_COMPACT}.format(v)}}}}});</script>`;
	return htmlPage(`Budget vs Actual — ${safeMonth}`, body);
}

export function renderDashboard(trends: MonthlyTrend[], budget: BudgetChartData | null): string {
	const parts: string[] = [];

	// Trends chart
	if (trends.length > 0) {
		const labels = JSON.stringify(trends.map((t) => t.month));
		const income = JSON.stringify(trends.map((t) => t.income));
		const spending = JSON.stringify(trends.map((t) => t.spending));
		parts.push(`<div class="cc"><h2>Monthly Income vs Spending</h2><canvas id="c1"></canvas></div>
<script>new Chart(document.getElementById('c1'),{type:'bar',data:{labels:${labels},datasets:[
{label:'Income',data:${income},backgroundColor:'rgba(75,192,192,0.7)',borderColor:'rgb(75,192,192)',borderWidth:1},
{label:'Spending',data:${spending},backgroundColor:'rgba(255,99,132,0.7)',borderColor:'rgb(255,99,132)',borderWidth:1}
]},options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+${VND_FMT}.format(c.raw)+' VND'}}},
scales:{y:{beginAtZero:true,ticks:{callback:v=>${VND_COMPACT}.format(v)}}}}});</script>`);
	}

	// Budget charts
	if (budget && budget.jars.length > 0) {
		const sm = esc(budget.month);
		const jLabels = JSON.stringify(budget.jars.map((j) => j.name));
		const actualData = JSON.stringify(budget.jars.map((j) => j.actual));
		const budgetData = JSON.stringify(budget.jars.map((j) => j.budget));
		const n = budget.jars.length;
		const colors = JSON.stringify(budget.jars.map((_, i) => `hsl(${Math.round((i * 360) / n)},70%,60%)`));

		parts.push(`<div class="cc"><h2>Spending by Category &mdash; ${sm}</h2><canvas id="c2"></canvas></div>
<script>new Chart(document.getElementById('c2'),{type:'doughnut',data:{labels:${jLabels},datasets:[{data:${actualData},backgroundColor:${colors}}]},
options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.label+': '+${VND_FMT}.format(c.raw)+' VND'}}}}});</script>`);

		parts.push(`<div class="cc"><h2>Budget vs Actual &mdash; ${sm}</h2><canvas id="c3"></canvas></div>
<script>new Chart(document.getElementById('c3'),{type:'bar',data:{labels:${jLabels},datasets:[
{label:'Budget',data:${budgetData},backgroundColor:'rgba(54,162,235,0.7)',borderColor:'rgb(54,162,235)',borderWidth:1},
{label:'Actual',data:${actualData},backgroundColor:'rgba(255,159,64,0.7)',borderColor:'rgb(255,159,64)',borderWidth:1}
]},options:{responsive:true,plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+${VND_FMT}.format(c.raw)+' VND'}}},
scales:{y:{beginAtZero:true,ticks:{callback:v=>${VND_COMPACT}.format(v)}}}}});</script>`);
	}

	if (parts.length === 0) {
		return renderNoData('No budget data available');
	}

	return htmlPage('Budget Dashboard', parts.join('\n'));
}
