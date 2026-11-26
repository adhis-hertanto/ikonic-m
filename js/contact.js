/* Contact page: client-side validation and success state for the enquiry form,
   and the placeholder brochure download. No backend: the form never posts. */
(function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function initForm(form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-field]'));
    var fieldsWrap = form.querySelector('.ct-form__fields');
    var success = form.querySelector('[data-contact-success]');
    var reset = form.querySelector('[data-contact-reset]');

    function controls(field) {
      return Array.prototype.slice.call(field.querySelectorAll('input, select, textarea'));
    }

    // Returns an error message, or '' when the field is valid.
    function check(field) {
      var c = controls(field);
      var kind = field.getAttribute('data-field');
      var required = field.getAttribute('data-required-msg');
      var invalid = field.getAttribute('data-invalid-msg');
      if (kind === 'role') return c.some(function (el) { return el.checked; }) ? '' : required;
      if (kind === 'consent') return c[0].checked ? '' : required;
      var value = c[0].value.trim();
      if (!value) return required;
      if (kind === 'email' && !EMAIL.test(value)) return invalid;
      if (kind === 'phone' && (!/^[+()\d][\d\s().-]*$/.test(value) || value.replace(/\D/g, '').length < 7)) return invalid;
      return '';
    }

    function show(field, message) {
      var error = field.querySelector('.ct-error');
      error.textContent = message;
      error.hidden = !message;
      field.classList.toggle('is-invalid', !!message);
      controls(field).forEach(function (el) {
        if (message) el.setAttribute('aria-invalid', 'true');
        else el.removeAttribute('aria-invalid');
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var firstInvalid = null;
      fields.forEach(function (field) {
        var message = check(field);
        show(field, message);
        if (message && !firstInvalid) firstInvalid = field;
      });
      if (firstInvalid) { controls(firstInvalid)[0].focus(); return; }
      fieldsWrap.hidden = true;
      success.hidden = false;
      success.focus();
    });

    // Clear an error as soon as the person fixes it; validate a field when they leave it.
    fields.forEach(function (field) {
      var showing = function () { return field.classList.contains('is-invalid'); };
      field.addEventListener('input', function () { if (showing()) show(field, check(field)); });
      field.addEventListener('change', function () { if (showing()) show(field, check(field)); });
      field.addEventListener('focusout', function (event) {
        if (field.contains(event.relatedTarget)) return;
        var c = controls(field)[0];
        var touched = c.type === 'radio' || c.type === 'checkbox' ? showing() : c.value.trim() !== '';
        if (touched) show(field, check(field));
      });
    });

    reset.addEventListener('click', function () {
      form.reset();
      fields.forEach(function (field) { show(field, ''); });
      success.hidden = true;
      fieldsWrap.hidden = false;
      controls(fields[0])[0].focus();
    });
  }

  function initBrochure(link) {
    link.addEventListener('click', function (event) {
      // PLACEHOLDER: no brochure file yet. Set data-brochure-src and href to the real file to enable the download.
      if (!link.getAttribute('data-brochure-src')) event.preventDefault();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('[data-contact-form]');
    if (form) initForm(form);
    var brochure = document.querySelector('[data-brochure]');
    if (brochure) initBrochure(brochure);
  });
})();
