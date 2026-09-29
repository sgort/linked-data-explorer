# Thuisbatterij — reference copy, drifted

**Nothing here is deployed, and none of it is current.** The maintained
definitions are:

|                              |                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| seeded into the BPMN Modeler | `packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn` |
| deployed by the E2E bundle   | `e2e-fixtures/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn`                      |

`e2e-fixtures/manifest.json` already says so, in the entry for that bundle: the
fixture was taken from the flevoland-tenant bundle deployed on
`operaton.open-regels.nl` rather than from this folder, because _"that folder's
`-main`/`-subprocess` pair and its two forms have drifted behind what is
actually deployed"_. The 2026-09-24 swimlanes plan says the same: the source of
truth is `packages/frontend/public/examples/flevoland/`, and this folder is not
touched.

Neither statement is visible from inside this folder, which is the gap this
file closes.

## How far it has drifted

`thuisbatterij-subsidie-flevoland-main.bpmn` references **three forms that
exist nowhere in the repository**:

- `thuisbatterij-subsidie-start` (start event)
- `awb-missing-info-form.html` — `Task_RequestMissingInfo`, as
  `camunda:formKey="embedded:deployment:..."`
- `thuisbatterij-notify-applicant` (`Task_Phase6_Notify`)

The maintained copy's three references all resolve
(`recht-en-hoogte-subsidie-thuisbatterij`, `thuisbatterij-aanvullende-gegevens`,
`awb-notify-applicant-thuisbatterij`).

The middle one is the subject of iou-architectuur#105 item 6, which found the
same dangling `awb-missing-info-form.html` in five files. Four were the seeded
and fixture copies of `AwbShellProcess` and `AwbZorgtoeslagProcess`, and those
are fixed — they now carry `camunda:formRef` with a form that exists, so
`Gateway_StillIncomplete`'s `${supplementReceived}` branch has something that
can set it.

This file was left as it is on purpose. Repairing one of its three dangling
references would fix a third of the problem while making a written-off file
look maintained; repairing all three would mean re-deriving a definition the
repository already replaced. Recording the state is the honest fix.

## If you need to change the process

Change the two maintained copies above, not this one. If this folder is ever
made current again, delete this file with the same commit.
