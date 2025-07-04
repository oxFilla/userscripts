// ==UserScript==
// @name            PO Form Enhancer
// @description     Simplifies filling out the Evolve PO form by setting default values (language, currency), saving project and approver from previous POs, formatting inserted numbers (commas) and calculating the sum of all costs
// @version         20250704
// @author          oxFilla
// @namespace       https://github.com/oxFilla
// @icon            https://evolve-partners.atlassian.net/s/g2slup/b/9/_/jira-favicon-scaled.png
// @match           https://evolve-partners.atlassian.net/*
// @updateURL       https://raw.githubusercontent.com/oxFilla/userscripts/main/PO-Form-Enhancer.user.js
// @downloadURL     https://raw.githubusercontent.com/oxFilla/userscripts/main/PO-Form-Enhancer.user.js
// @supportURL      https://github.com/oxFilla/userscripts/issues
// @grant           GM_getValue
// @grant           GM_setValue
// @run-at          document-start
// @compatible      chrome
// @license         GPL3
// ==/UserScript==

"use strict";

// =======================================================================================
// Config/Requirements
// =======================================================================================

const tableSelector = "div.pm-table-container > div.pm-table-wrapper > table > tbody";
const sumSelector = 'input[label="Nettosumme"]';

const QUANTITY_COL_INDEX = 3; // 0-based index
const NET_COST_COL_INDEX = 4; // 0-based index
const NET_COST_COL_INPUT_SELECTOR = `td:nth-child(${NET_COST_COL_INDEX + 1}) input`;

// Use React's internal properties to set the value
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

/**
 * Waits for an element until it exists
 *
 * @param {string} selector CSS selector of a NodeList/HTMLCollection
 * @param {number} index
 * @see source: {@link https://stackoverflow.com/a/61511955/13427318}
 * @returns Element
 */
function waitForElement(selector, index = 0) {
    return new Promise((resolve) => {
        if (selector && document.querySelector(selector) && document.querySelectorAll(selector)[index]) {
            return resolve(document.querySelectorAll(selector)[index]);
        }

        const observer = new MutationObserver(() => {
            if (selector && document.querySelectorAll(selector) && document.querySelectorAll(selector)[index]) {
                resolve(document.querySelectorAll(selector)[index]);
                observer.disconnect();
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true,
        });
    });
}

// =======================================================================================
// Functions
// =======================================================================================

// Set default values for the form
async function setDefaultValues() {
    // Set the language to German
    const languageIndicator = await waitForElement("#pf-undefined-cd-192 > div[class*=-control] div[class*=indicatorContainer]");
    if (!languageIndicator) {
        console.warn("Language indicator not found.");
        return;
    }

    languageIndicator.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const selectDeutsch = document.querySelector("div[id*=option-0]");
    if (selectDeutsch) {
        selectDeutsch.click();
    }

    const table = await waitForElement(tableSelector);

    setTimeout(() => {
        const rows = table.querySelectorAll("tr");

        // Process the last column for each row
        for (const row of rows) {
            const columns = row.querySelectorAll("td");
            if (columns.length === 0) continue;
            const waehrungColumn = columns[columns.length - 1];
            const waehrungDropdownElement = waehrungColumn.querySelector("div[class*=indicatorContainer]");
            if (waehrungDropdownElement) {
                // We have to set the currency via simulated click because the dropdown is managed by a React component.
                // Setting the value directly in the DOM or by attribute is ignored by React.
                // Only by opening the dropdown (mousedown) and clicking on the desired option
                // the value is accepted correctly and processed internally.
                waehrungDropdownElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                const eurOption = waehrungColumn.querySelector("div[id*=option-0]");
                if (eurOption) {
                    eurOption.click();
                } else {
                    console.log("no option");
                }
            }
        }

        // select the project
        (async () => {
            const projectForm = document.querySelector('div[aria-labelledby="label-pf-undefined-cs-115"]');
            if (!projectForm) {
                console.warn("Project selection form not found.");
                return;
            }

            const priorProjectChoice = await GM_getValue("priorProjectChoice", false);
            if (priorProjectChoice) {
                if (projectForm) {
                    // Restore the selected project from GM storage
                    const projectInput = projectForm.querySelector(`input[value="${priorProjectChoice}"]`);
                    if (projectInput) {
                        projectInput.click();
                    } else {
                        console.warn("No project input found to restore selection.");
                    }
                } else {
                    console.warn("Project selection form not found.");
                }
            } else {
                // If no project was selected before, select the last input as project (no project)
                const projectInputs = projectForm.querySelectorAll("input[type='radio']");
                const lastProjectInput = projectInputs[projectInputs.length - 1];
                if (lastProjectInput) {
                    lastProjectInput.click();
                } else {
                    console.warn("No project input found to select the first project.");
                }
            }

            // add event listener to save the selected projet to GM storage
            projectForm.addEventListener("change", async (event) => {
                const target = event.target;
                if (target && target.type === "radio" && target.value) {
                    await GM_setValue("priorProjectChoice", target.value);
                    console.log("Selected project saved:", target.value);
                }
            });
        })();

        // select the approver
        (async () => {
            const approverForm = document.querySelector("#pf-undefined-cd-88");
            if (!approverForm) {
                console.warn("Approver selection form not found.");
                return;
            }
            const dropdownElement = approverForm.querySelector("div[class*=indicatorContainer]");

            const priorApproverChoice = await GM_getValue("priorApproverChoice", false);
            if (priorApproverChoice && dropdownElement) {
                // Restore the selected approver from GM storage
                // We have to set the currency via simulated click because the dropdown is managed by a React component.
                // Setting the value directly in the DOM or by attribute is ignored by React.
                // Only by opening the dropdown (mousedown) and clicking on the desired option
                // the value is accepted correctly and processed internally.
                dropdownElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

                // Find the option that matches the saved approver choice
                const approverOptions = approverForm.querySelectorAll("div[id*=option]");
                const approverOption = Array.from(approverOptions).find((option) => option.textContent.trim() === priorApproverChoice);

                if (approverOption) {
                    approverOption.click();
                } else {
                    console.warn("No approver found to restore selection.");
                }
            }

            // add event listener to save the selected approver to GM storage
            approverForm.addEventListener("click", async (event) => {
                // Check whether an option has been clicked
                const option = event.target.closest("div[id*=option]");
                if (option) {
                    const selectedApprover = option.innerText.trim();
                    if (selectedApprover) {
                        await GM_setValue("priorApproverChoice", selectedApprover);
                        console.log("Selected Approver saved:", selectedApprover);
                    }
                }
            });
        })();

        // focus first input field
        setTimeout(() => {
            const firstInput = table.querySelector("input");
            if (firstInput) {
                firstInput.focus();
            }
        }, 10);
    }, 10);
}

/**
 * Sets up a clipboard listener for all input fields in the "Netto-Kosten pro Einheit" column.
 * The listener formats the pasted text to match the current locale's decimal separator.
 */
async function pasteFormatter() {
    await waitForElement(NET_COST_COL_INPUT_SELECTOR);

    // Select all input fields in the "Netto-Kosten pro Einheit" column
    const priceInputs = document.querySelectorAll(NET_COST_COL_INPUT_SELECTOR);

    // Detect the current locale's decimal separator
    const decimalSeparator = (1.1).toLocaleString().substring(1, 2);
    const thousandSeparator = decimalSeparator === "." ? "," : ".";

    priceInputs.forEach((priceInput) => {
        priceInput.addEventListener("paste", function (event) {
            event.preventDefault(); // Prevent the default paste action

            // Get the pasted text from the clipboard
            let clipboardData = event.clipboardData || window.clipboardData;
            let pastedText = clipboardData.getData("text");

            // Check if the pasted text contains a comma as decimal separator
            const commaIndex = pastedText.lastIndexOf(",");
            const isDecimalComma = commaIndex > -1 && commaIndex > pastedText.length - 4;

            if (isDecimalComma) {
                // Remove thousand separators and replace the decimal separator with a dot
                const formattedText = pastedText
                    .replace(new RegExp(`\\${thousandSeparator}(?=\\d{3}(?:\\D|$))`, "g"), "")
                    .replace(decimalSeparator, ".");

                // Insert the formatted text into the input field
                nativeInputValueSetter.call(priceInput, formattedText);
            } else {
                // Remove thousands separator to avoid confusion with decimal separators
                const formattedText = pastedText
                    .replace(new RegExp(`\\${thousandSeparator}(?=\\d{3}(?:\\D|$))`, "g"), "")
                    .replace(decimalSeparator, "");

                // Insert the formatted text into the input field
                nativeInputValueSetter.call(priceInput, formattedText);
            }

            // Trigger input event
            priceInput.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });
}

/**
 * Calculates the sum of all numbers in the fields of the fifth column and updates the specified element.
 */
function calculateAndUpdateSum() {
    const table = document.querySelector(tableSelector);
    const sumElement = document.querySelector(sumSelector);
    if (!sumElement) {
        console.warn("Sum element not found. Cannot update sum.");
        return;
    }

    const rows = table.querySelectorAll("tr");
    let sum = 0;

    rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length > 4) {
            const quantityInput = cells[QUANTITY_COL_INDEX]?.querySelector("input");
            const priceInput = cells[NET_COST_COL_INDEX]?.querySelector("input");

            const quantity = parseFloat(quantityInput?.value);
            const price = parseFloat(priceInput?.value);

            if (!isNaN(quantity) && !isNaN(price)) {
                sum += quantity * price;
            }
        }
    });

    const formattedSum = sum.toFixed(2);

    nativeInputValueSetter.call(sumElement, formattedSum);

    // Dispatch input event to notify React of the change
    sumElement.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Adds event listeners to all input fields in the fifth column to update the sum on input change.
 */
async function addEventsForSumUpdate() {
    const table = await waitForElement(tableSelector);

    setTimeout(() => {
        const rows = table.querySelectorAll("tr");

        rows.forEach((row) => {
            const columns = row.querySelectorAll("td");
            if (columns.length > 4) {
                const priceField = columns[4].querySelector("input");
                const quantityField = columns[3].querySelector("input");
                if (priceField && quantityField) {
                    // Add event listeners to both input fields
                    priceField.addEventListener("input", calculateAndUpdateSum);
                    quantityField.addEventListener("input", calculateAndUpdateSum);
                }
            }
        });
    }, 100);
}

// Function to handle URL changes and set up event listeners
function setupUrlChangeDetection() {
    let lastUrl = window.location.href;

    // Initial check if the URL already matches
    if (lastUrl.includes("servicedesk/customer/portal/7/") && lastUrl.includes("create/59")) {
        main();
    }

    function handleUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            console.debug("URL changed from", lastUrl, "to", currentUrl);
            lastUrl = currentUrl;

            // Wait a moment for the DOM to update after navigation
            if (currentUrl.includes("servicedesk/customer/portal/7/") && currentUrl.includes("create/59")) {
                main();
            }
        }
    }

    // Listen for popstate events (triggered by back/forward buttons)
    window.addEventListener("popstate", handleUrlChange);

    // For history.pushState and history.replaceState, we need to override them
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        handleUrlChange();
    };

    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        handleUrlChange();
    };
}

// =======================================================================================
// Main
// =======================================================================================

function main() {
    setDefaultValues();
    pasteFormatter();
    addEventsForSumUpdate();
}

// Set up URL change detection as website is a one-page application
setupUrlChangeDetection();
