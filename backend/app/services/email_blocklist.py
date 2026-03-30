DISPOSABLE_DOMAINS: set[str] = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.info", "grr.la",
    "guerrillamail.biz", "guerrillamail.de", "guerrillamail.net",
    "guerrillamail.org", "sharklasers.com", "guerrilla.ml",
    "tempmail.com", "temp-mail.org", "temp-mail.io",
    "throwaway.email", "throwaway.com",
    "yopmail.com", "yopmail.fr", "yopmail.net",
    "mailnesia.com", "maildrop.cc", "dispostable.com",
    "trashmail.com", "trashmail.me", "trashmail.net",
    "fakeinbox.com", "getnada.com", "tempail.com",
    "10minutemail.com", "10minutemail.net",
    "20minutemail.com", "20minutemail.it",
    "mailcatch.com", "mytemp.email",
    "mohmal.com", "burnermail.io",
    "harakirimail.com", "tempr.email",
    "discard.email", "discardmail.com", "discardmail.de",
    "spamgourmet.com", "spamgourmet.net",
    "mailexpire.com", "tempinbox.com",
    "emailondeck.com", "33mail.com",
    "inboxalias.com", "spamfree24.org",
    "trash-mail.com", "bugmenot.com",
    "receiveee.com", "tmail.ws",
    "tmails.net", "tmpmail.net", "tmpmail.org",
    "crazymailing.com", "disposableemailaddresses.emailmiser.com",
    "mailforspam.com", "safetymail.info",
    "instant-mail.de", "emkei.cz",
    "armyspy.com", "cuvox.de", "dayrep.com",
    "einrot.com", "fleckens.hu", "gustr.com",
    "jourrapide.com", "rhyta.com", "superrito.com",
    "teleworm.us",
}


def is_disposable_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    return domain in DISPOSABLE_DOMAINS
