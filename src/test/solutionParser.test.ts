import * as assert from 'assert';
import * as path from 'path';
import { contarProjetos, parseSln, parseSlnx } from '../solution/parser';

const DIR = path.resolve('/repo');

suite('Parser de solução', () => {
	test('.sln com pasta de solução aninhada', () => {
		const sln = [
			'﻿',
			'Microsoft Visual Studio Solution File, Format Version 12.00',
			'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "App.Gui", "src\\App.Gui\\App.Gui.csproj", "{11111111-1111-1111-1111-111111111111}"',
			'EndProject',
			'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "testes", "testes", "{22222222-2222-2222-2222-222222222222}"',
			'EndProject',
			'Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "App.Tests", "tests\\App.Tests\\App.Tests.csproj", "{33333333-3333-3333-3333-333333333333}"',
			'EndProject',
			'Global',
			'\tGlobalSection(NestedProjects) = preSolution',
			'\t\t{33333333-3333-3333-3333-333333333333} = {22222222-2222-2222-2222-222222222222}',
			'\tEndGlobalSection',
			'EndGlobal',
		].join('\r\n');

		assert.deepStrictEqual(parseSln(sln, DIR), [
			{
				tipo: 'pasta', nome: 'testes', filhos: [
					{ tipo: 'projeto', nome: 'App.Tests', caminho: path.join(DIR, 'tests', 'App.Tests', 'App.Tests.csproj') },
				],
			},
			{ tipo: 'projeto', nome: 'App.Gui', caminho: path.join(DIR, 'src', 'App.Gui', 'App.Gui.csproj') },
		]);
	});

	test('.slnx com pastas e projeto na raiz', () => {
		const slnx = `<Solution>
  <!-- <Project Path="comentado.csproj" /> -->
  <Folder Name="/src/web/">
    <Project Path="src/web/Api/Api.csproj">
      <BuildType Project="Release" />
    </Project>
  </Folder>
  <Folder Name="/vazia/" />
  <Project Path="Ferramenta/Ferramenta.csproj" />
</Solution>`;

		const nos = parseSlnx(slnx, DIR);
		assert.deepStrictEqual(nos, [
			{
				tipo: 'pasta', nome: 'src', filhos: [
					{
						tipo: 'pasta', nome: 'web', filhos: [
							{ tipo: 'projeto', nome: 'Api', caminho: path.join(DIR, 'src', 'web', 'Api', 'Api.csproj') },
						],
					},
				],
			},
			{ tipo: 'pasta', nome: 'vazia', filhos: [] },
			{ tipo: 'projeto', nome: 'Ferramenta', caminho: path.join(DIR, 'Ferramenta', 'Ferramenta.csproj') },
		]);
		assert.strictEqual(contarProjetos(nos), 2);
	});
});
