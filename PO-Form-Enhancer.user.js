// ==UserScript==
// @name            PO Form Enhancer
// @description     Simplifies the completion of the Evolve PO form by setting default values, formatting pasted numbers, and calculating the sum of all costs
// @version         20250312
// @author          oxFilla
// @namespace       https://github.com/oxFilla
// @icon            https://evolve-partners.atlassian.net/s/g2slup/b/9/_/jira-favicon-scaled.png
// @match           https://evolve-partners.atlassian.net/*
// @updateURL       https://raw.githubusercontent.com/oxFilla/userscripts/main/PO-Form-Enhancer.user.js
// @downloadURL     https://raw.githubusercontent.com/oxFilla/userscripts/main/PO-Form-Enhancer.user.js
// @supportURL      https://github.com/oxFilla/userscripts/issues
// @run-at          document-start
// @compatible      chrome
// @license         GPL3
// ==/UserScript==

// =======================================================================================
// Config/Requirements
// =======================================================================================

const tableSelector = "div.pm-table-container > div.pm-table-wrapper > table > tbody";

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
    languageIndicator.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const selectDeutsch = document.querySelector("div[id*=option-0]");
    if (selectDeutsch) {
        selectDeutsch.click();
    }

    const table = await waitForElement(tableSelector);

    setTimeout(() => {
        const rows = table.querySelectorAll("tr");

        /**
         * Processes each cell in a specified column of a table.
         *
         * @param {number} columnIndex - The index of the column to process.
         * @param {function} processCell - A callback function to process each cell.
         *                                 It receives the cell element and a callback to process the next row.
         */
        function processColumn(columnIndex, processCell) {
            const processRow = (rowIndex) => {
                if (rowIndex >= rows.length) return;

                const row = rows[rowIndex];
                const columns = row.querySelectorAll("td");

                if (columns.length > columnIndex) {
                    processCell(columns[columnIndex], () => {
                        processRow(rowIndex + 1);
                    });
                } else {
                    processRow(rowIndex + 1);
                }
            };

            processRow(0);
        }

        // Process the last column for each row
        function processWaehrungColumn(processCell) {
            const processRow = (rowIndex) => {
                if (rowIndex >= rows.length) return;

                const row = rows[rowIndex];
                const columns = row.querySelectorAll("td");
                const lastColumnIndex = columns.length - 1;

                if (lastColumnIndex >= 0) {
                    processCell(columns[lastColumnIndex], () => {
                        processRow(rowIndex + 1);
                    });
                } else {
                    processRow(rowIndex + 1);
                }
            };

            processRow(0);
        }

        // Process the waehrung column as last column for each row
        // This is necessary because the last row has only two columns
        // - waehrungColumn: The column element to process
        // - next: A callback function to process the next
        processWaehrungColumn((waehrungColumn, next) => {
            const waehrungSelectContainer = waehrungColumn.querySelector("div[class*=-control]");
            if (waehrungSelectContainer) {
                waehrungSelectContainer
                    .querySelector("div[class*=indicatorContainer]")
                    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

                const eurOption = waehrungColumn.querySelector("div[id*=option-0]");
                if (eurOption) {
                    eurOption.click();
                } else {
                    console.log("no option");
                }
                next();
            } else {
                next();
            }
        });

        // TODO: Add your logic for each column here
        // Process columns[2] for each row
        processColumn(2, (einheitColumn, next) => {
            // Add your logic for einheitColumn here
            next();
        });

        // Process columns[1] for each row
        processColumn(1, (leistungsartColumn, next) => {
            // Add your logic for leistungsartColumn here
            next();
        });

        // focus first input field
        const firstInput = table.querySelector("input");
        if (firstInput) {
            firstInput.focus();
        }
    }, 10);
}

/**
 * Sets up a clipboard listener for all input fields with label="number".
 * The listener formats the pasted text to match the current locale's decimal separator.
 */
async function setupClipboardListener() {
    await waitForElement('input[label="number"]');

    // Select all input fields with label="number"
    let inputFields = document.querySelectorAll('input[label="number"]');

    // Detect the current locale's decimal separator
    const decimalSeparator = (1.1).toLocaleString().substring(1, 2);
    const thousandSeparator = decimalSeparator === "." ? "," : ".";

    inputFields.forEach(function (inputField) {
        inputField.addEventListener("paste", function (event) {
            event.preventDefault(); // Prevent the default paste action

            // Get the pasted text from the clipboard
            let clipboardData = event.clipboardData || window.clipboardData;
            let pastedText = clipboardData.getData("text");

            // Check if the pasted text contains a comma as decimal separator
            const commaIndex = pastedText.lastIndexOf(",");
            const isDecimalComma = commaIndex > -1 && commaIndex > pastedText.length - 4;

            if (isDecimalComma) {
                // Remove thousand separators and replace the decimal separator with a dot
                let formattedText = pastedText
                    .replace(new RegExp(`\\${thousandSeparator}(?=\\d{3}(?:\\D|$))`, "g"), "")
                    .replace(decimalSeparator, ".");

                // Insert the formatted text into the input field
                inputField.value = formattedText;

                // Update the input attribute value
                inputField.setAttribute("value", formattedText);
            } else {
                // Check if the pasted text contains a dot as decimal separator

                // Remove thousand separators
                let formattedText = pastedText
                    .replace(new RegExp(`\\${thousandSeparator}(?=\\d{3}(?:\\D|$))`, "g"), "")
                    .replace(decimalSeparator, "");

                // Insert the pasted text as is
                inputField.value = formattedText;

                // Update the input attribute value
                inputField.setAttribute("value", formattedText);
            }

            // Trigger input event
            const changeEvent = new Event("input", { bubbles: true });
            inputField.dispatchEvent(changeEvent);
        });
    });
}

/**
 * Calculates the sum of all numbers in the fields of the fifth column and updates the specified element.
 */
function calculateAndUpdateSum() {
    const sumElement = document.querySelector("input#pf-undefined-ts-347");

    const table = document.querySelector(tableSelector);
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    let sum = 0;

    rows.forEach((row) => {
        const columns = row.querySelectorAll("td");
        if (columns.length > 4) {
            const inputField = columns[4].querySelector("input");
            if (inputField) {
                const value = parseFloat(inputField.value);
                if (!isNaN(value)) {
                    sum += value;
                }
            }
        }
    });

    const formattedSum = sum.toFixed(2);

    // Use React's internal properties to set the value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(sumElement, formattedSum);

    // Dispatch input event to notify React of the change
    const inputEvent = new Event("input", { bubbles: true });
    sumElement.dispatchEvent(inputEvent);
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
                const inputField = columns[4].querySelector("input");
                if (inputField) {
                    inputField.addEventListener("input", calculateAndUpdateSum);
                }
            }
        });
    }, 100);
}

// Function to handle URL changes and set up event listeners
function setupUrlChangeDetection() {
    let lastUrl = window.location.href;

    // Initial check if the URL already matches
    if (lastUrl.includes("servicedesk/customer/portal/7/group/12/create/59")) {
        main();
    }

    function handleUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            console.log("URL changed from", lastUrl, "to", currentUrl);
            lastUrl = currentUrl;

            // Wait a moment for the DOM to update after navigation
            if (currentUrl.includes("servicedesk/customer/portal/7/group/12/create/59")) {
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
    setupClipboardListener();
    addEventsForSumUpdate();
}

// Set up URL change detection
setupUrlChangeDetection();
