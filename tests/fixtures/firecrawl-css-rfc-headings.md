# RFC 9111

# HTTP Caching

## [Abstract](https://www.rfc-editor.org/rfc/rfc9111.html\#abstract)

## [Status of This Memo](https://www.rfc-editor.org/rfc/rfc9111.html\#name-status-of-this-memo)

## [Copyright Notice](https://www.rfc-editor.org/rfc/rfc9111.html\#name-copyright-notice)

## [Table of Contents](https://www.rfc-editor.org/rfc/rfc9111.html\#name-table-of-contents)

## [1\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-1) [Introduction](https://www.rfc-editor.org/rfc/rfc9111.html\#name-introduction)

### [1.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-1.1) [Requirements Notation](https://www.rfc-editor.org/rfc/rfc9111.html\#name-requirements-notation)

### [1.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-1.2) [Syntax Notation](https://www.rfc-editor.org/rfc/rfc9111.html\#name-syntax-notation)

#### [1.2.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-1.2.1) [Imported Rules](https://www.rfc-editor.org/rfc/rfc9111.html\#name-imported-rules)

#### [1.2.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-1.2.2) [Delta Seconds](https://www.rfc-editor.org/rfc/rfc9111.html\#name-delta-seconds)

## [2\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-2) [Overview of Cache Operation](https://www.rfc-editor.org/rfc/rfc9111.html\#name-overview-of-cache-operation)

## [3\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3) [Storing Responses in Caches](https://www.rfc-editor.org/rfc/rfc9111.html\#name-storing-responses-in-caches)

### [3.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3.1) [Storing Header and Trailer Fields](https://www.rfc-editor.org/rfc/rfc9111.html\#name-storing-header-and-trailer-)

### [3.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3.2) [Updating Stored Header Fields](https://www.rfc-editor.org/rfc/rfc9111.html\#name-updating-stored-header-fiel)

### [3.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3.3) [Storing Incomplete Responses](https://www.rfc-editor.org/rfc/rfc9111.html\#name-storing-incomplete-response)

### [3.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3.4) [Combining Partial Content](https://www.rfc-editor.org/rfc/rfc9111.html\#name-combining-partial-content)

### [3.5.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-3.5) [Storing Responses to Authenticated Requests](https://www.rfc-editor.org/rfc/rfc9111.html\#name-storing-responses-to-authen)

## [4\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4) [Constructing Responses from Caches](https://www.rfc-editor.org/rfc/rfc9111.html\#name-constructing-responses-from)

### [4.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.1) [Calculating Cache Keys with the Vary Header Field](https://www.rfc-editor.org/rfc/rfc9111.html\#name-calculating-cache-keys-with)

### [4.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.2) [Freshness](https://www.rfc-editor.org/rfc/rfc9111.html\#name-freshness)

#### [4.2.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.2.1) [Calculating Freshness Lifetime](https://www.rfc-editor.org/rfc/rfc9111.html\#name-calculating-freshness-lifet)

#### [4.2.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.2.2) [Calculating Heuristic Freshness](https://www.rfc-editor.org/rfc/rfc9111.html\#name-calculating-heuristic-fresh)

#### [4.2.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.2.3) [Calculating Age](https://www.rfc-editor.org/rfc/rfc9111.html\#name-calculating-age)

#### [4.2.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.2.4) [Serving Stale Responses](https://www.rfc-editor.org/rfc/rfc9111.html\#name-serving-stale-responses)

### [4.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3) [Validation](https://www.rfc-editor.org/rfc/rfc9111.html\#name-validation)

#### [4.3.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3.1) [Sending a Validation Request](https://www.rfc-editor.org/rfc/rfc9111.html\#name-sending-a-validation-reques)

#### [4.3.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3.2) [Handling a Received Validation Request](https://www.rfc-editor.org/rfc/rfc9111.html\#name-handling-a-received-validat)

#### [4.3.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3.3) [Handling a Validation Response](https://www.rfc-editor.org/rfc/rfc9111.html\#name-handling-a-validation-respo)

#### [4.3.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3.4) [Freshening Stored Responses upon Validation](https://www.rfc-editor.org/rfc/rfc9111.html\#name-freshening-stored-responses)

#### [4.3.5.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.3.5) [Freshening Responses with HEAD](https://www.rfc-editor.org/rfc/rfc9111.html\#name-freshening-responses-with-h)

### [4.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-4.4) [Invalidating Stored Responses](https://www.rfc-editor.org/rfc/rfc9111.html\#name-invalidating-stored-respons)

## [5\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5) [Field Definitions](https://www.rfc-editor.org/rfc/rfc9111.html\#name-field-definitions)

### [5.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.1) [Age](https://www.rfc-editor.org/rfc/rfc9111.html\#name-age)

### [5.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2) [Cache-Control](https://www.rfc-editor.org/rfc/rfc9111.html\#name-cache-control)

#### [5.2.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1) [Request Directives](https://www.rfc-editor.org/rfc/rfc9111.html\#name-request-directives)

##### [5.2.1.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.1) [max-age](https://www.rfc-editor.org/rfc/rfc9111.html\#name-max-age)

##### [5.2.1.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.2) [max-stale](https://www.rfc-editor.org/rfc/rfc9111.html\#name-max-stale)

##### [5.2.1.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.3) [min-fresh](https://www.rfc-editor.org/rfc/rfc9111.html\#name-min-fresh)

##### [5.2.1.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.4) [no-cache](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-cache)

##### [5.2.1.5.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.5) [no-store](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-store)

##### [5.2.1.6.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.6) [no-transform](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-transform)

##### [5.2.1.7.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.1.7) [only-if-cached](https://www.rfc-editor.org/rfc/rfc9111.html\#name-only-if-cached)

#### [5.2.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2) [Response Directives](https://www.rfc-editor.org/rfc/rfc9111.html\#name-response-directives)

##### [5.2.2.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.1) [max-age](https://www.rfc-editor.org/rfc/rfc9111.html\#name-max-age-2)

##### [5.2.2.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.2) [must-revalidate](https://www.rfc-editor.org/rfc/rfc9111.html\#name-must-revalidate)

##### [5.2.2.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.3) [must-understand](https://www.rfc-editor.org/rfc/rfc9111.html\#name-must-understand)

##### [5.2.2.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.4) [no-cache](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-cache-2)

##### [5.2.2.5.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.5) [no-store](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-store-2)

##### [5.2.2.6.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.6) [no-transform](https://www.rfc-editor.org/rfc/rfc9111.html\#name-no-transform-2)

##### [5.2.2.7.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.7) [private](https://www.rfc-editor.org/rfc/rfc9111.html\#name-private)

##### [5.2.2.8.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.8) [proxy-revalidate](https://www.rfc-editor.org/rfc/rfc9111.html\#name-proxy-revalidate)

##### [5.2.2.9.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.9) [public](https://www.rfc-editor.org/rfc/rfc9111.html\#name-public)

##### [5.2.2.10.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.2.10) [s-maxage](https://www.rfc-editor.org/rfc/rfc9111.html\#name-s-maxage)

#### [5.2.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.3) [Extension Directives](https://www.rfc-editor.org/rfc/rfc9111.html\#name-extension-directives)

#### [5.2.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.2.4) [Cache Directive Registry](https://www.rfc-editor.org/rfc/rfc9111.html\#name-cache-directive-registry)

### [5.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.3) [Expires](https://www.rfc-editor.org/rfc/rfc9111.html\#name-expires)

### [5.4.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.4) [Pragma](https://www.rfc-editor.org/rfc/rfc9111.html\#name-pragma)

### [5.5.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-5.5) [Warning](https://www.rfc-editor.org/rfc/rfc9111.html\#name-warning)

## [6\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-6) [Relationship to Applications and Other Caches](https://www.rfc-editor.org/rfc/rfc9111.html\#name-relationship-to-application)

## [7\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-7) [Security Considerations](https://www.rfc-editor.org/rfc/rfc9111.html\#name-security-considerations)

### [7.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-7.1) [Cache Poisoning](https://www.rfc-editor.org/rfc/rfc9111.html\#name-cache-poisoning)

### [7.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-7.2) [Timing Attacks](https://www.rfc-editor.org/rfc/rfc9111.html\#name-timing-attacks)

### [7.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-7.3) [Caching of Sensitive Information](https://www.rfc-editor.org/rfc/rfc9111.html\#name-caching-of-sensitive-inform)

## [8\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-8) [IANA Considerations](https://www.rfc-editor.org/rfc/rfc9111.html\#name-iana-considerations)

### [8.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-8.1) [Field Name Registration](https://www.rfc-editor.org/rfc/rfc9111.html\#name-field-name-registration)

### [8.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-8.2) [Cache Directive Registration](https://www.rfc-editor.org/rfc/rfc9111.html\#name-cache-directive-registratio)

### [8.3.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-8.3) [Warn Code Registry](https://www.rfc-editor.org/rfc/rfc9111.html\#name-warn-code-registry)

## [9\.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-9) [References](https://www.rfc-editor.org/rfc/rfc9111.html\#name-references)

### [9.1.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-9.1) [Normative References](https://www.rfc-editor.org/rfc/rfc9111.html\#name-normative-references)

### [9.2.](https://www.rfc-editor.org/rfc/rfc9111.html\#section-9.2) [Informative References](https://www.rfc-editor.org/rfc/rfc9111.html\#name-informative-references)

## [Appendix A.](https://www.rfc-editor.org/rfc/rfc9111.html\#appendix-A) [Collected ABNF](https://www.rfc-editor.org/rfc/rfc9111.html\#name-collected-abnf)

## [Appendix B.](https://www.rfc-editor.org/rfc/rfc9111.html\#appendix-B) [Changes from RFC 7234](https://www.rfc-editor.org/rfc/rfc9111.html\#name-changes-from-rfc-7234)

## [Acknowledgements](https://www.rfc-editor.org/rfc/rfc9111.html\#name-acknowledgements)

## [Index](https://www.rfc-editor.org/rfc/rfc9111.html\#name-index)

## [Authors' Addresses](https://www.rfc-editor.org/rfc/rfc9111.html\#name-authors-addresses)