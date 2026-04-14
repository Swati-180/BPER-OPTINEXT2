# Project Task List: OptiNext

## Phase 3: Finalize MongoDB Atlas data and master setup
- [x] no direct UI feature here except handling loading/empty states where DB data is used later
- [x] test API responses against real Atlas data
- [x] confirm all pages receive real IDs and usable payload shapes
- [x] verify schemas and relations work properly
- [x] ensure departments, towers, settings, activities, users, and submissions are stored correctly
- [x] verify standardHours/settings retrieval works
- [x] seed required master activity/process data if missing
- [x] verify Atlas connection
- [x] verify collections are structured correctly
- [x] verify required initial data exists and is usable

## Phase 4: Connect employee process and activity dropdowns to backend
- [x] replace hardcoded dropdown options
- [x] bind dropdown selection with fetched data
- [x] show loading, no data, and error states
- [x] maintain clean dependent dropdown logic if parent category changes
- [x] show proper empty state if no activity/process data is available for the selected department
- [x] connect employee form with activity-by-department API
- [x] pass correct department IDs
- [x] confirm fetched data format matches the UI structure
- [x] verify selected activity IDs go correctly in submission payload
- [x] confirm activity endpoints return consistent data
- [x] adjust response format if frontend needs flatter or grouped data
- [x] make sure activities are correctly filtered by department
- [x] verify real department/activity records exist in Atlas
- [x] confirm only relevant options are shown

## Phase 5: Connect employee WDT submission flow
- [x] connect final submit button to real API
- [x] show success/error messages
- [x] show employee submission history
- [x] show status labels clearly
- [x] allow returned submissions to be revised
- [ ] allow edit request flow where needed
- [ ] add submission window visibility in dashboard and form
- [ ] show submission deadline clearly
- [ ] disable submit button when submission window is closed
- [ ] show message when submissions are closed
- [x] add autosave draft behavior in FormWizard/Step2 so data is not lost on refresh
- [x] show draft save indicator like "Saved ✔"
- [ ] strengthen Step2 and Step3 validation
- [ ] validate hours > 0
- [ ] validate required fields before submit
- [ ] validate numeric fields properly
- [x] map frontend form fields to backend WDT payload: department
- [x] map frontend form fields to backend WDT payload: month
- [x] map frontend form fields to backend WDT payload: year
- [x] map frontend form fields to backend WDT payload: activities
- [ ] map frontend form fields to backend WDT payload: overtimeHours
- [x] connect employee history page to "my submissions"
- [x] connect revision and edit request flows to APIs
- [x] handle returned_for_revision, submitted, approved states correctly
- [x] connect submission window API to dashboard/form behavior
- [x] connect autosave draft API if draft endpoint is added
- [x] confirm payload validation is correct
- [x] confirm save/update logic works correctly for resubmissions
- [ ] confirm reviewer assignment and standardHours logic works
- [x] return frontend-friendly responses for submission status
- [ ] add submission window support if not already available
- [ ] add draft save support if not already available
- [x] verify submission records are saved correctly in Atlas
- [x] verify updates do not break old records
- [ ] verify month/year-based duplicate logic works as expected
- [ ] verify closed submission window prevents actual submission
- [x] verify autosaved drafts restore correctly if user refreshes
