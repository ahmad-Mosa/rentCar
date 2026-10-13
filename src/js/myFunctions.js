/* ==========================================================
   myFunctions.js - the ONLY external JavaScript file.
   Contains: validation functions, cost calculation, and the
   jQuery code for showing/hiding details and the booking form.
   ========================================================== */

var DISCOUNT_LIMIT_DAYS = 7; // discount applies when days > 7
var DISCOUNT_RATE = 0.1; // 10% of the subtotal (applied once)
var MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ---------------- Helper functions ---------------- */

// 250000 -> "250,000"
function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Money with the Syrian pound label, wrapped so it displays correctly in RTL
function formatMoney(n) {
  return '<span class="ltr">' + formatNumber(n) + "</span> ل.س";
}

// Escape text before inserting it into HTML
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------------- Validation functions ----------------
   Each function returns "" when the value is valid,
   otherwise it returns the Arabic error message.        */

// Full name: optional; Arabic letters only (spaces allowed between words)
function validateName(value) {
  var name = $.trim(value);
  if (name === "") {
    return ""; // optional field
  }
  // Arabic letters (hamza, alef ... yaa) + optional diacritics
  var word = "[ء-غف-يً-ْ]+";
  var pattern = new RegExp("^" + word + "(\\s+" + word + ")*$");
  if (!pattern.test(name)) {
    return "الاسم يجب أن يحتوي على أحرف عربية فقط (دون أرقام أو أحرف لاتينية أو رموز).";
  }
  return "";
}

// National ID: required; 11 digits; first two digits 01..14
function validateNationalId(value) {
  if (value === "") {
    return "الرقم الوطني إلزامي.";
  }
  if (!/^[0-9]+$/.test(value)) {
    return "الرقم الوطني يجب أن يتكون من أرقام فقط (دون مسافات أو أحرف).";
  }
  if (value.length !== 11) {
    return "الرقم الوطني يجب أن يتكون من 11 خانة بالضبط.";
  }
  var governorate = parseInt(value.substring(0, 2), 10);
  if (governorate < 1 || governorate > 14) {
    return "أول خانتين من الرقم الوطني يجب أن تمثلا رمز المحافظة من 01 إلى 14.";
  }
  return "";
}

// Parse "yyyy-mm-dd" and make sure it is a REAL calendar date.
// Returns a number of milliseconds (UTC) or null when invalid.
function parseDate(value) {
  var match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  var year = parseInt(match[1], 10);
  var month = parseInt(match[2], 10);
  var day = parseInt(match[3], 10);
  var time = Date.UTC(year, month - 1, day);
  var d = new Date(time);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null; // e.g. 2026-02-30
  }
  return time;
}

function validateStartDate(value) {
  if (value === "") {
    return "تاريخ بداية التأجير إلزامي.";
  }
  if (parseDate(value) === null) {
    return "تاريخ البداية غير صحيح. استخدم الصيغة yyyy-mm-dd وتاريخاً حقيقياً (مثال: 2026-11-01).";
  }
  return "";
}

function validateEndDate(value, startValue) {
  if (value === "") {
    return "تاريخ نهاية التأجير إلزامي.";
  }
  var end = parseDate(value);
  if (end === null) {
    return "تاريخ النهاية غير صحيح. استخدم الصيغة yyyy-mm-dd وتاريخاً حقيقياً (مثال: 2026-11-08).";
  }
  var start = parseDate(startValue);
  if (start !== null && end <= start) {
    return "تاريخ النهاية يجب أن يكون لاحقاً لتاريخ البداية.";
  }
  return "";
}

// Mobile: optional; Syriatel (093, 098, 099) or MTN (094, 095, 096)
// Accepted: 09XXXXXXXX, +9639XXXXXXXX, 009639XXXXXXXX, 9639XXXXXXXX
// (spaces and hyphens between digits are ignored)
function validateMobile(value) {
  var mobile = $.trim(value);
  if (mobile === "") {
    return ""; // optional field
  }
  mobile = mobile.replace(/[\s\-]/g, "");
  if (/^\+9639/.test(mobile)) {
    mobile = "0" + mobile.substring(4);
  } else if (/^009639/.test(mobile)) {
    mobile = "0" + mobile.substring(5);
  } else if (/^9639/.test(mobile)) {
    mobile = "0" + mobile.substring(3);
  }
  if (!/^09[345689][0-9]{7}$/.test(mobile)) {
    return "رقم الموبايل غير صحيح. الأرقام المقبولة: سيريتل (093 / 098 / 099) أو MTN (094 / 095 / 096)، مثل 0933123456 أو +963933123456.";
  }
  return "";
}

// Email: optional
function validateEmail(value) {
  var email = $.trim(value);
  if (email === "") {
    return ""; // optional field
  }
  var pattern = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$/;
  if (
    !pattern.test(email) ||
    email.indexOf("..") !== -1 ||
    email.charAt(0) === "."
  ) {
    return "البريد الإلكتروني غير صحيح. مثال على الصيغة الصحيحة: name@example.com";
  }
  return "";
}

/* ---------------- Showing / clearing error messages ---------------- */

function showFieldError(fieldId, message) {
  $("#err-" + fieldId).text(message);
  if (message === "") {
    $("#" + fieldId).removeClass("invalid");
  } else {
    $("#" + fieldId).addClass("invalid");
  }
}

// Validate one field by its id and show the message next to it.
// Returns true when valid.
function checkField(fieldId) {
  var value = $("#" + fieldId).val();
  var message = "";
  if (fieldId === "fullname") {
    message = validateName(value);
  } else if (fieldId === "nationalid") {
    message = validateNationalId(value);
  } else if (fieldId === "startdate") {
    message = validateStartDate(value);
  } else if (fieldId === "enddate") {
    message = validateEndDate(value, $("#startdate").val());
  } else if (fieldId === "mobile") {
    message = validateMobile(value);
  } else if (fieldId === "email") {
    message = validateEmail(value);
  }
  showFieldError(fieldId, message);
  return message === "";
}

// Validate the whole form (in page order). Returns true when all fields are valid.
function validateForm() {
  var fields = [
    "fullname",
    "nationalid",
    "mobile",
    "email",
    "startdate",
    "enddate",
  ];
  var allValid = true;
  var firstInvalid = "";
  var i;
  for (i = 0; i < fields.length; i++) {
    if (!checkField(fields[i])) {
      allValid = false;
      if (firstInvalid === "") {
        firstInvalid = fields[i];
      }
    }
  }
  if (firstInvalid !== "") {
    $("#" + firstInvalid).focus();
  }
  return allValid;
}

/* ---------------- Reading the selected cars from the table ---------------- */

// Returns an array of objects: {code, model, price}
function getSelectedCars() {
  var selected = [];
  $(".car-select:checked").each(function () {
    var code = $(this).val();
    var row = $("#row-" + code);
    selected.push({
      code: code,
      model: $.trim(row.find(".col-model").text()),
      price: parseInt(row.find(".price-value").text(), 10),
    });
  });
  return selected;
}

// Fill the "selected cars" list above the form
function updateSelectedSummary() {
  var cars = getSelectedCars();
  var html = "";
  var i;
  for (i = 0; i < cars.length; i++) {
    html +=
      '<li><span class="ltr">' +
      escapeHtml(cars[i].code) +
      " - " +
      escapeHtml(cars[i].model) +
      "</span>: " +
      formatMoney(cars[i].price) +
      " / يوم</li>";
  }
  $("#selected-list").html(html);
}

/* ---------------- Rental cost calculation ---------------- */

function calculateRental(cars, startTime, endTime) {
  var days = Math.round((endTime - startTime) / MS_PER_DAY);
  var lines = [];
  var subtotal = 0;
  var i;
  for (i = 0; i < cars.length; i++) {
    var cost = cars[i].price * days;
    subtotal = subtotal + cost;
    lines.push({
      code: cars[i].code,
      model: cars[i].model,
      price: cars[i].price,
      cost: cost,
    });
  }
  var discount = 0;
  if (days > DISCOUNT_LIMIT_DAYS) {
    discount = Math.round(subtotal * DISCOUNT_RATE); // applied once, on the subtotal
  }
  return {
    days: days,
    lines: lines,
    subtotal: subtotal,
    discount: discount,
    total: subtotal - discount,
  };
}

function buildResultHtml(result) {
  var html = "";
  var i;
  html +=
    '<p class="msg-success">تم التحقق من البيانات بنجاح. هذه تفاصيل طلب الحجز:</p>';
  html += "<p><strong>مدة التأجير:</strong> " + result.days + " يوم</p>";
  html +=
    '<div class="table-wrap"><table class="info-table"><thead><tr>' +
    "<th>السيارة</th><th>السعر اليومي</th><th>عدد الأيام</th><th>تكلفة السيارة</th></tr></thead><tbody>";
  for (i = 0; i < result.lines.length; i++) {
    var line = result.lines[i];
    html +=
      '<tr><td><span class="ltr">' +
      escapeHtml(line.code) +
      " - " +
      escapeHtml(line.model) +
      "</span></td>" +
      "<td>" +
      formatMoney(line.price) +
      "</td>" +
      "<td>" +
      result.days +
      "</td>" +
      "<td>" +
      formatMoney(line.cost) +
      "</td></tr>";
  }
  html +=
    '<tr><td colspan="3">المجموع قبل الخصم</td><td>' +
    formatMoney(result.subtotal) +
    "</td></tr>";
  if (result.discount > 0) {
    html +=
      '<tr class="discount-row"><td colspan="3">الخصم (10% لأن المدة أكثر من 7 أيام)</td><td>- ' +
      formatMoney(result.discount) +
      "</td></tr>";
  } else {
    html +=
      '<tr><td colspan="3">الخصم (المدة 7 أيام أو أقل)</td><td>' +
      formatMoney(0) +
      "</td></tr>";
  }
  html +=
    '<tr class="total-row"><td colspan="3">المبلغ النهائي</td><td>' +
    formatMoney(result.total) +
    "</td></tr>";
  html += "</tbody></table></div>";
  return html;
}

function closeResult() {
  $("#result-overlay").fadeOut(150);
}

/* ---------------- Page events (jQuery) ---------------- */

$(document).ready(function () {
  // 1) Show / hide the details of ONE car using its own checkbox
  $(".detail-toggle").on("change", function () {
    var row = $("#details-" + $(this).val());
    if ($(this).is(":checked")) {
      row.fadeIn(200);
    } else {
      row.fadeOut(200);
    }
  });

  // 2) "متابعة" button: check the selection, then show the booking form
  $("#continue-btn").on("click", function () {
    var cars = getSelectedCars();
    if (cars.length === 0) {
      $("#continue-message")
        .text("الرجاء اختيار سيارة واحدة على الأقل قبل المتابعة.")
        .slideDown(150);
      return;
    }
    $("#continue-message").hide();
    updateSelectedSummary();
    $("#booking-section").slideDown(250, function () {
      $("html, body").animate(
        { scrollTop: $("#booking-section").offset().top - 10 },
        300,
      );
    });
  });

  // Keep the summary correct if the selection changes after pressing "متابعة"
  $(".car-select").on("change", function () {
    if ($("#booking-section").is(":visible")) {
      updateSelectedSummary();
    }
    if ($(".car-select:checked").length > 0) {
      $("#continue-message").hide();
    }
  });

  // 3) Validate a field when the user leaves it
  $("#booking-form input[type='text']").on("blur", function () {
    checkField($(this).attr("id"));
  });

  // 4) "إرسال" button: validate everything, then calculate and show the result
  $("#booking-form").on("submit", function (event) {
    event.preventDefault(); // never reload the page
    $("#form-message").hide();

    var cars = getSelectedCars();
    if (cars.length === 0) {
      $("#form-message")
        .text("لا توجد سيارة مختارة. اختر سيارة واحدة على الأقل من الجدول.")
        .slideDown(150);
      return false;
    }
    if (!validateForm()) {
      $("#form-message")
        .text("يوجد أخطاء في النموذج. صحّح الحقول المحددة ثم أعد المحاولة.")
        .slideDown(150);
      return false;
    }

    var startTime = parseDate($("#startdate").val());
    var endTime = parseDate($("#enddate").val());
    var result = calculateRental(cars, startTime, endTime);

    $("#result-content").html(buildResultHtml(result));
    $("#result-overlay").fadeIn(200);
    return false;
  });

  // 5) Close the result window
  $("#result-close").on("click", closeResult);
  $("#result-overlay").on("click", function (event) {
    if (event.target === this) {
      closeResult();
    }
  });
  $(document).on("keydown", function (event) {
    if (event.keyCode === 27) {
      closeResult();
    }
  });
});
