#!/bin/sh
# Rewords the widget's English text: readers only ever give a name (there is
# no account or login provider), so "Sign In"/"Username" was misleading.
# Run at image build time; fails the build if an upstream update changed a
# string, so a version bump can't silently bring the old wording back.
set -eu
f=/srv/web/remark.mjs

swap() {
	grep -qF "$1" "$f" || { echo "relabel: not found in $f: $1" >&2; exit 1; }
	# Escape for sed: the strings contain no "|" or newlines.
	from=$(printf '%s' "$1" | sed 's/[][\.*^$/]/\\&/g')
	to=$(printf '%s' "$2" | sed 's/[\&/]/\\&/g')
	sed -i "s|$from|$to|g" "$f"
}

swap 'id:"auth.signin",defaultMessage:"Sign In"' 'id:"auth.signin",defaultMessage:"Add your name"'
swap 'defaultMessage:"Username"' 'defaultMessage:"Your name"'
swap 'id:"auth.submit",defaultMessage:"Submit"' 'id:"auth.submit",defaultMessage:"Continue"'
swap 'id:"auth.signout",defaultMessage:"Sign Out"' 'id:"auth.signout",defaultMessage:"Change name"'
swap 'defaultMessage:"Image uploading is disabled for anonymous users. Please log in not as anonymous user to be able to attach images."' 'defaultMessage:"Pictures can'"'"'t be added to comments."'
swap 'defaultMessage:"Image uploading is disabled for unauthorized users. You should login before uploading."' 'defaultMessage:"Pictures can'"'"'t be added to comments."'
swap 'defaultMessage:"Allow cookies to login and comment"' 'defaultMessage:"Allow cookies to comment"'
swap 'defaultMessage:"Username must contain only letters, numbers, underscores or spaces"' 'defaultMessage:"Names can only use letters, numbers, spaces and underscores"'
# The name form's heading prints the raw provider id ("anonymous").
swap '1===o.length?w("h5",{className:K("auth-form-title",Nn.title),children:o[0]}' '1===o.length?w("h5",{className:K("auth-form-title",Nn.title),children:"No account needed"}'
echo "relabel: done"
