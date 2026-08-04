let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarRelatorios();
});

async function carregarRelatorios() {
    const periodo = document.getElementById('filtroPeriodo').value;
    const today = new Date();
    let startDate = null;

    if (periodo !== 'todos') {
        const pastDate = new Date(today.setDate(today.getDate() - parseInt(periodo)));
        startDate = pastDate.toISOString().split('T')[0];
    }

    try {
        let queryCortes = db.from('cortes').select(`
            data, valor,
            servicos (nome),
            produtos (nome),
            clientes (nome)
        `);

        if (startDate) {
            queryCortes = queryCortes.gte('data', startDate);
        }

        const { data: cortes, error } = await queryCortes;
        
        if (error) throw error;

        calcularMetricas(cortes);
        renderDiasSemanaChart(cortes);
        renderTops(cortes);

    } catch (error) {
        console.error("Erro ao carregar relatórios", error);
        showToast("Erro ao carregar dados.", "danger");
    }
}

function calcularMetricas(cortes) {
    const totalAtendimentos = cortes.length;
    let faturamentoTotal = 0;

    cortes.forEach(c => {
        faturamentoTotal += parseFloat(c.valor);
    });

    const ticketMedio = totalAtendimentos > 0 ? faturamentoTotal / totalAtendimentos : 0;

    document.getElementById('totalAtendimentos').textContent = totalAtendimentos;
    document.getElementById('ticketMedio').textContent = formatCurrency(ticketMedio);
}

function renderTops(cortes) {
    const servicosCount = {};
    const produtosCount = {};
    const clientesCount = {};

    cortes.forEach(c => {
        if (c.servicos && c.servicos.nome) {
            servicosCount[c.servicos.nome] = (servicosCount[c.servicos.nome] || 0) + 1;
        }
        if (c.produtos && c.produtos.nome) {
            produtosCount[c.produtos.nome] = (produtosCount[c.produtos.nome] || 0) + 1;
        }
        if (c.clientes && c.clientes.nome) {
            clientesCount[c.clientes.nome] = (clientesCount[c.clientes.nome] || 0) + 1;
        }
    });

    const topServicos = Object.entries(servicosCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topProdutos = Object.entries(produtosCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topClientes = Object.entries(clientesCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    document.getElementById('topServicosBody').innerHTML = topServicos.length ? topServicos.map(s => `<tr><td>${s[0]}</td><td>${s[1]}</td></tr>`).join('') : '<tr><td colspan="2" class="text-center">Sem dados</td></tr>';
    document.getElementById('topProdutosBody').innerHTML = topProdutos.length ? topProdutos.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td></tr>`).join('') : '<tr><td colspan="2" class="text-center">Sem dados</td></tr>';
    document.getElementById('topClientesBody').innerHTML = topClientes.length ? topClientes.map(c => `<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('') : '<tr><td colspan="2" class="text-center">Sem dados</td></tr>';
}

function renderDiasSemanaChart(cortes) {
    const ctx = document.getElementById('diasSemanaChart').getContext('2d');
    
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    // Para evitar problemas de fuso horário na conversão de string YYYY-MM-DD
    cortes.forEach(c => {
        const [year, month, day] = c.data.split('-');
        const dateObj = new Date(year, month - 1, day);
        counts[dateObj.getDay()] += 1;
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dias,
            datasets: [{
                label: 'Nº de Atendimentos',
                data: counts,
                backgroundColor: '#e8b75f',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#e2e8f0' } },
                x: { grid: { display: false }, ticks: { color: '#e2e8f0' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function downloadCSV(csvContent, fileName) {
    const blob = new Blob(["\uFEFF"+csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

async function exportarAtendimentos() {
    try {
        showToast("Gerando backup de Atendimentos...", "info");
        const { data, error } = await db.from('cortes').select(`
            data, valor, tipo,
            clientes(nome),
            servicos(nome),
            produtos(nome)
        `).order('data', { ascending: false });

        if (error) throw error;

        let csv = "Data;Cliente;Item;Tipo de Item;Forma de Pagamento;Valor\n";
        data.forEach(row => {
            const cliente = row.clientes ? row.clientes.nome : "Avulso";
            const item = row.servicos ? row.servicos.nome : (row.produtos ? row.produtos.nome : "");
            const tipoItem = row.servicos ? "Serviço" : "Produto";
            csv += `${row.data};${cliente};${item};${tipoItem};${row.tipo};${row.valor}\n`;
        });

        downloadCSV(csv, `backup_atendimentos_${new Date().toISOString().split('T')[0]}.csv`);
        showToast("Backup gerado com sucesso!", "success");
    } catch (error) {
        console.error(error);
        showToast("Erro ao gerar backup.", "danger");
    }
}

async function exportarAssinaturas() {
    try {
        showToast("Gerando backup de Assinaturas...", "info");
        const { data, error } = await db.from('assinaturas').select(`
            data_inicio, data_vencimento, situacao, valor,
            clientes(nome, telefone, matricula),
            planos(nome)
        `).order('data_vencimento', { ascending: true });

        if (error) throw error;

        let csv = "Matricula;Cliente;Telefone;Plano;Valor;Data Inicio;Data Vencimento;Status\n";
        data.forEach(row => {
            const c = row.clientes || {};
            const p = row.planos || {};
            csv += `${c.matricula||''};${c.nome||''};${c.telefone||''};${p.nome||''};${row.valor};${row.data_inicio};${row.data_vencimento};${row.situacao}\n`;
        });

        downloadCSV(csv, `backup_assinaturas_${new Date().toISOString().split('T')[0]}.csv`);
        showToast("Backup gerado com sucesso!", "success");
    } catch (error) {
        console.error(error);
        showToast("Erro ao gerar backup.", "danger");
    }
}

async function exportarFinanceiro() {
    try {
        showToast("Gerando backup Financeiro...", "info");
        const { data, error } = await db.from('movimentacoes').select('*').order('data', { ascending: false });

        if (error) throw error;

        let csv = "Data;Descricao;Categoria;Tipo;Valor\n";
        data.forEach(row => {
            csv += `${row.data};${row.descricao};${row.categoria||''};${row.tipo};${row.valor}\n`;
        });

        downloadCSV(csv, `backup_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
        showToast("Backup gerado com sucesso!", "success");
    } catch (error) {
        console.error(error);
        showToast("Erro ao gerar backup.", "danger");
    }
}
