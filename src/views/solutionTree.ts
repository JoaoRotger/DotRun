import * as path from 'path';
import * as vscode from 'vscode';
import { NoSolucao, contarProjetos, nomeSemExtensao, ordenar, parseSln, parseSlnx } from '../solution/parser';

export type NoArvore =
	| { tipo: 'solucao'; nome: string; caminho: string; filhos: NoSolucao[] }
	| NoSolucao;

const EXCLUIR = '**/{node_modules,bin,obj}/**';

export class SolutionTreeProvider implements vscode.TreeDataProvider<NoArvore> {
	private _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChange.event;

	private raiz: NoArvore[] = [];

	async carregar() {
		try {
			this.raiz = await this.lerWorkspace();
		} catch (erro) {
			this.raiz = [];
			vscode.window.showErrorMessage(`DotRun: falha ao ler a solução: ${erro instanceof Error ? erro.message : erro}`);
		}
		await vscode.commands.executeCommand('setContext', 'dotrun.hasSolution', this.raiz.length > 0);
		this._onDidChange.fire();
	}

	private async lerWorkspace(): Promise<NoArvore[]> {
		const solucao = escolherSolucao(await vscode.workspace.findFiles('**/*.{sln,slnx}', EXCLUIR));
		if (solucao) {
			const texto = new TextDecoder().decode(await vscode.workspace.fs.readFile(solucao));
			const dir = path.dirname(solucao.fsPath);
			const filhos = solucao.fsPath.toLowerCase().endsWith('.slnx')
				? parseSlnx(texto, dir)
				: parseSln(texto, dir);
			return [{ tipo: 'solucao', nome: nomeSemExtensao(solucao.fsPath), caminho: solucao.fsPath, filhos }];
		}

		// Sem solução: mostra os projetos soltos
		const projetos = await vscode.workspace.findFiles('**/*.csproj', EXCLUIR);
		return ordenar(projetos.map(u => ({ tipo: 'projeto', nome: nomeSemExtensao(u.fsPath), caminho: u.fsPath })));
	}

	getTreeItem(no: NoArvore): vscode.TreeItem {
		switch (no.tipo) {
			case 'solucao': {
				const n = contarProjetos(no.filhos);
				const item = new vscode.TreeItem(
					`Solução '${no.nome}' (${n} projeto${n === 1 ? '' : 's'})`,
					vscode.TreeItemCollapsibleState.Expanded);
				item.resourceUri = vscode.Uri.file(no.caminho);
				item.tooltip = no.caminho;
				item.contextValue = 'solution';
				return item;
			}
			case 'pasta': {
				const item = new vscode.TreeItem(no.nome, vscode.TreeItemCollapsibleState.Expanded);
				item.iconPath = vscode.ThemeIcon.Folder;
				item.contextValue = 'folder';
				return item;
			}
			case 'projeto': {
				const item = new vscode.TreeItem(no.nome, vscode.TreeItemCollapsibleState.None);
				item.resourceUri = vscode.Uri.file(no.caminho);
				item.tooltip = no.caminho;
				item.contextValue = 'project';
				return item;
			}
		}
	}

	getChildren(no?: NoArvore): NoArvore[] {
		if (!no) { return this.raiz; }
		return no.tipo === 'projeto' ? [] : no.filhos;
	}
}

// Com várias soluções, fica com a mais próxima da raiz (empate: ordem alfabética)
function escolherSolucao(uris: vscode.Uri[]): vscode.Uri | undefined {
	const profundidade = (u: vscode.Uri) => u.fsPath.split(/[\\/]/).length;
	return [...uris].sort((a, b) =>
		profundidade(a) - profundidade(b) || a.fsPath.localeCompare(b.fsPath))[0];
}
