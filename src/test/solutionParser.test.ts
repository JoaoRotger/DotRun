import * as assert from 'assert';
import * as path from 'path';
import {
	listProjects, parseSln, parseSlnConfigurations, parseSlnx, parseSlnxConfigurations,
} from '../solution/parser';
import { isExecutableProject } from '../solution/projectFile';

const DIR = path.resolve('/repo');

suite('Solution parser', () => {
	test('.sln with a nested solution folder', () => {
		const sln = [
			'﻿',
			'Microsoft Visual Studio Solution File, Format Version 12.00',
			'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "App.Gui", "src\\App.Gui\\App.Gui.csproj", "{11111111-1111-1111-1111-111111111111}"',
			'EndProject',
			'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "tests", "tests", "{22222222-2222-2222-2222-222222222222}"',
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
				kind: 'folder', name: 'tests', children: [
					{ kind: 'project', name: 'App.Tests', path: path.join(DIR, 'tests', 'App.Tests', 'App.Tests.csproj') },
				],
			},
			{ kind: 'project', name: 'App.Gui', path: path.join(DIR, 'src', 'App.Gui', 'App.Gui.csproj') },
		]);
	});

	test('.slnx with folders and a root-level project', () => {
		const slnx = `<Solution>
  <!-- <Project Path="commented.csproj" /> -->
  <Folder Name="/src/web/">
    <Project Path="src/web/Api/Api.csproj">
      <BuildType Project="Release" />
    </Project>
  </Folder>
  <Folder Name="/empty/" />
  <Project Path="Tool/Tool.csproj" />
</Solution>`;

		const nodes = parseSlnx(slnx, DIR);
		assert.deepStrictEqual(nodes, [
			{ kind: 'folder', name: 'empty', children: [] },
			{
				kind: 'folder', name: 'src', children: [
					{
						kind: 'folder', name: 'web', children: [
							{ kind: 'project', name: 'Api', path: path.join(DIR, 'src', 'web', 'Api', 'Api.csproj') },
						],
					},
				],
			},
			{ kind: 'project', name: 'Tool', path: path.join(DIR, 'Tool', 'Tool.csproj') },
		]);
		assert.deepStrictEqual(listProjects(nodes).map(p => p.name), ['Api', 'Tool']);
	});
});

suite('Solution configurations', () => {
	test('.sln: unique names, platform ignored', () => {
		const sln = [
			'Global',
			'\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
			'\t\tDebug|Any CPU = Debug|Any CPU',
			'\t\tDebug|x64 = Debug|x64',
			'\t\tStaging|Any CPU = Staging|Any CPU',
			'\t\tRelease|Any CPU = Release|Any CPU',
			'\tEndGlobalSection',
			'\tGlobalSection(ProjectConfigurationPlatforms) = postSolution',
			'\t\t{11111111-1111-1111-1111-111111111111}.Other|Any CPU.ActiveCfg = Other|Any CPU',
			'\tEndGlobalSection',
			'EndGlobal',
		].join('\r\n');
		assert.deepStrictEqual(parseSlnConfigurations(sln), ['Debug', 'Staging', 'Release']);
	});

	test('.sln without the section falls back to Debug/Release', () => {
		assert.deepStrictEqual(parseSlnConfigurations('Global\r\nEndGlobal'), ['Debug', 'Release']);
	});

	test('.slnx: only BuildType entries inside <Configurations>', () => {
		const slnx = `<Solution>
  <Configurations>
    <BuildType Name="Debug" />
    <BuildType Name="Staging" />
    <Platform Name="Any CPU" />
  </Configurations>
  <Project Path="App/App.csproj">
    <BuildType Solution="Staging|*" Project="Release" />
  </Project>
</Solution>`;
		assert.deepStrictEqual(parseSlnxConfigurations(slnx), ['Debug', 'Staging']);
		assert.deepStrictEqual(parseSlnxConfigurations('<Solution />'), ['Debug', 'Release']);
	});
});

suite('Executable project detection', () => {
	const csproj = (sdk: string, body = '') => `<Project Sdk="${sdk}"><PropertyGroup>${body}</PropertyGroup></Project>`;

	test('OutputType Exe and WinExe are executable', () => {
		assert.ok(isExecutableProject(csproj('Microsoft.NET.Sdk', '<OutputType>Exe</OutputType>')));
		assert.ok(isExecutableProject(csproj('Microsoft.NET.Sdk', '<OutputType>WinExe</OutputType>')));
	});

	test('class library is not executable', () => {
		assert.ok(!isExecutableProject(csproj('Microsoft.NET.Sdk')));
		assert.ok(!isExecutableProject(csproj('Microsoft.NET.Sdk', '<OutputType>Library</OutputType>')));
	});

	test('Web SDK is executable without OutputType', () => {
		assert.ok(isExecutableProject(csproj('Microsoft.NET.Sdk.Web')));
	});

	test('test project is not executable even with OutputType Exe', () => {
		assert.ok(!isExecutableProject(csproj('Microsoft.NET.Sdk', '<OutputType>Exe</OutputType><IsTestProject>true</IsTestProject>')));
		assert.ok(!isExecutableProject(
			'<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" /></ItemGroup></Project>'));
	});
});
